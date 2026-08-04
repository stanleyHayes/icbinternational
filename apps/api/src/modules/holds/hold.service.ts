import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, HoldReason, HoldStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { BalanceService } from './balance.service.js';
import { HOLD_EXPIRY_BATCH, HOLD_TRANSACTION_LABEL } from './hold.constants.js';
import { HoldStore, type HoldRecord } from './hold.store.js';

/**
 * Placing, releasing and expiring holds.
 *
 * Every path is one transaction that touches two documents — the hold and its account —
 * and either both move or neither does. That is not ceremony: a hold written without its
 * reserve makes money spendable that a merchant is about to claim, and a reserve written
 * without its hold makes money unspendable with no record of why, which is the harder of
 * the two to ever diagnose.
 *
 * Capture lives in `HoldCaptureService`, because it additionally books a real posting and
 * therefore needs the ledger; keeping it separate leaves this file free of the entry
 * vocabulary.
 */
@Injectable()
export class HoldService {
  private readonly logger = new Logger(HoldService.name);

  constructor(
    private readonly holds: HoldStore,
    private readonly balances: BalanceService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Reserves funds against an account.
   *
   * @throws {AppError} `INVALID_AMOUNT` for a non-positive amount; whatever the funds
   *   check refuses — `INSUFFICIENT_FUNDS`, `ACCOUNT_FROZEN`, `CURRENCY_MISMATCH`.
   */
  async place(input: PlaceHoldInput): Promise<HoldRecord> {
    assertPositive(input.amount);

    const hold = await this.runner.runIn(
      input.session,
      async (session) => {
        await this.balances.reserve({
          accountId: input.accountId,
          amount: input.amount,
          session,
        });

        return this.holds.insert(
          {
            accountId: input.accountId,
            amount: toStored(input.amount),
            reason: input.reason,
            description: input.description,
            placedAt: this.clock.now(),
            expiresAt: input.expiresAt ?? null,
            authorisationId: input.authorisationId ?? null,
          },
          session,
        );
      },
      { label: HOLD_TRANSACTION_LABEL.PLACE },
    );

    this.logger.log(`Held ${input.amount.format()} on ${input.accountId} (${hold.id})`);
    return hold;
  }

  /**
   * Gives a hold's reserve back without taking anything.
   *
   * @throws {AppError} `HOLD_NOT_FOUND`, or `HOLD_ALREADY_RELEASED` if it has already
   *   been released, captured or expired.
   */
  async release(input: { holdId: string; session?: ClientSession }): Promise<HoldRecord> {
    return this.runner.runIn(
      input.session,
      async (session) => {
        const hold = await this.require(input.holdId, session);
        return this.resolveWithin({ hold, status: HoldStatus.RELEASED, session });
      },
      { label: HOLD_TRANSACTION_LABEL.RELEASE },
    );
  }

  /**
   * Resolves every hold whose expiry has passed.
   *
   * Each in its own transaction, so one account locked by a concurrent authorisation
   * cannot stop the sweep from freeing everybody else's money. Holds that lose the race
   * and are resolved by something else mid-sweep are skipped, not retried — they are
   * already resolved, which is the outcome the sweep wanted.
   *
   * @returns How many holds this pass expired.
   */
  async expireDue(limit: number = HOLD_EXPIRY_BATCH): Promise<number> {
    const due = await this.holds.listExpired({ asOf: this.clock.now(), limit });
    let expired = 0;

    for (const hold of due) {
      const resolved = await this.expireOne(hold);
      if (resolved) expired += 1;
    }

    if (expired > 0) this.logger.log(`Expired ${expired} holds`);
    return expired;
  }

  /** The hold, or `HOLD_NOT_FOUND`. */
  async require(holdId: string, session?: ClientSession): Promise<HoldRecord> {
    const hold = await this.holds.findById(holdId, session);
    if (!hold) {
      throw new AppError({
        code: ErrorCode.HOLD_NOT_FOUND,
        message: 'No such hold.',
        context: { holdId },
      });
    }
    return hold;
  }

  /** Every live hold against an account, newest first. */
  async listActive(accountId: string, session?: ClientSession): Promise<HoldRecord[]> {
    return this.holds.listActive(accountId, session);
  }

  /**
   * Marks a hold resolved and gives its reserve back, inside a session the caller owns.
   *
   * The status transition happens first and is conditional on the hold still being
   * `ACTIVE`. That single conditional write is what makes release, capture and expiry
   * exactly-once: whoever wins it is the only one that goes on to move the balance, and
   * the losers see `HOLD_ALREADY_RELEASED` with nothing having moved.
   *
   * The **full** hold amount is always restored, even on a partial capture. The capture's
   * own posting then debits what was actually taken, and the difference is left spendable
   * — which is exactly what a fuel pump authorising a hundred and taking thirty should do.
   */
  async resolveWithin(input: ResolveWithinInput): Promise<HoldRecord> {
    const resolved = await this.holds.resolve({
      holdId: input.hold.id,
      status: input.status,
      resolvedAt: this.clock.now(),
      ...(input.capturedAmount ? { capturedAmount: toStored(input.capturedAmount) } : {}),
      ...(input.capturedEntryId ? { capturedEntryId: input.capturedEntryId } : {}),
      session: input.session,
    });

    if (!resolved) throw alreadyResolved(input.hold);

    await this.balances.restore({
      accountId: input.hold.accountId,
      amount: fromStored(input.hold.amount),
      session: input.session,
    });

    return resolved;
  }

  /** One expiry, isolated so a conflict on one account cannot fail the whole sweep. */
  private async expireOne(hold: HoldRecord): Promise<boolean> {
    try {
      await this.runner.run(
        (session) => this.resolveWithin({ hold, status: HoldStatus.EXPIRED, session }),
        { label: HOLD_TRANSACTION_LABEL.EXPIRE },
      );
      return true;
    } catch (error) {
      if (isAlreadyResolved(error)) return false;
      throw error;
    }
  }
}

/** Everything a caller must say to reserve funds. */
export interface PlaceHoldInput {
  readonly accountId: string;
  /** Positive, in the account's own currency. */
  readonly amount: Money;
  readonly reason: HoldReason;
  readonly description: string;
  /** When the hold lapses on its own. Omit for one that never does. */
  readonly expiresAt?: Date;
  /** The card authorisation this hold backs, when there is one. */
  readonly authorisationId?: string;
  /** Join a wider transaction — a card authorisation that also writes an auth record. */
  readonly session?: ClientSession;
}

export interface ResolveWithinInput {
  readonly hold: HoldRecord;
  readonly status: Exclude<HoldStatus, 'ACTIVE'>;
  readonly session: ClientSession;
  readonly capturedAmount?: Money;
  readonly capturedEntryId?: string;
}

function assertPositive(amount: Money): void {
  if (amount.isPositive) return;

  throw new AppError({
    code: ErrorCode.INVALID_AMOUNT,
    message: 'A hold must be for a positive amount.',
    context: { amount: amount.toJSON() },
  });
}

function alreadyResolved(hold: HoldRecord): AppError {
  return new AppError({
    code: ErrorCode.HOLD_ALREADY_RELEASED,
    message: 'That hold has already been settled.',
    context: { holdId: hold.id, reason: hold.reason as HoldReason },
  });
}

function isAlreadyResolved(error: unknown): boolean {
  return error instanceof AppError && error.code === ErrorCode.HOLD_ALREADY_RELEASED;
}
