import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  AccountStatus,
  ErrorCode,
  type Account,
  type CloseAccountRequest,
} from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { movementEntries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';

import { ACCOUNT_TRANSACTION_LABEL } from './account.constants.js';
import { toContractAccount } from './account.mapper.js';
import { accountNotFound, isHeldBy } from './account.service.js';
import { AccountStore, type AccountRecord } from './account.store.js';

/** Prefix on the journal reference for the sweep, so a statement names the reason. */
const CLOSURE_REFERENCE_PREFIX = 'CLOSE-';

/**
 * Closing an account.
 *
 * Two guards decide whether a closure is even possible, and neither is negotiable:
 *
 * - **A non-zero balance refuses the closure.** Money in a closed account is money the
 *   bank has quietly kept; money owed by one is a debt the bank has quietly written off.
 *   The customer sweeps the residue to another of their accounts — supplied as
 *   `sweepToAccountId` — and the sweep is a real posting through the ledger, in the same
 *   transaction as the closure, so the two can never half-happen.
 * - **An active hold refuses the closure.** A hold is a promise to a third party that
 *   money will be there when they capture it. Closing the account underneath one either
 *   breaks that promise or strands the funds; the customer releases or waits for the hold
 *   first, and `ACCOUNT_HAS_ACTIVE_HOLDS` says exactly that.
 *
 * An overdrawn account cannot be swept clear — there is nothing to move — so it is
 * refused outright until the customer repays it.
 */
@Injectable()
export class AccountClosureService {
  private readonly logger = new Logger(AccountClosureService.name);

  constructor(
    private readonly accounts: AccountStore,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Closes a customer's account, sweeping any residual balance first.
   *
   * Idempotent: closing an already-closed account returns it unchanged rather than
   * failing, because the customer who taps twice has asked for a state that already holds.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND`, `ACCOUNT_HAS_ACTIVE_HOLDS` or
   *   `ACCOUNT_NOT_EMPTY`.
   */
  async close(input: {
    userId: string;
    accountId: string;
    request: CloseAccountRequest;
  }): Promise<Account> {
    const record = await this.runner.run((session) => this.closeWithin(input, session), {
      label: ACCOUNT_TRANSACTION_LABEL.CLOSE,
    });

    return toContractAccount(record, this.clock.now());
  }

  private async closeWithin(
    input: { userId: string; accountId: string; request: CloseAccountRequest },
    session: ClientSession,
  ): Promise<AccountRecord> {
    const account = await this.accounts.findById(input.accountId, session);
    if (!account || !isHeldBy(account, input.userId)) throw accountNotFound(input.accountId);
    if (account.status === AccountStatus.CLOSED) return account;

    assertNoActiveHolds(account);
    await this.sweepResidue({ account, request: input.request, session });

    const closed = await this.accounts.patch({
      accountId: account.id,
      fields: {
        status: AccountStatus.CLOSED,
        closedAt: this.clock.now(),
        // A closed account must not remain the customer's default destination.
        isPrimary: false,
      },
      session,
    });

    if (!closed) throw accountNotFound(input.accountId);
    this.logger.log(`Closed account ${closed.id}: ${input.request.reason}`);
    return closed;
  }

  /**
   * Moves whatever is left to the nominated account, through the ledger.
   *
   * A direct balance write would be faster and would also be the one place in the bank
   * where money moved without a journal entry — which is precisely the hole the double
   * entry rule exists to close.
   */
  private async sweepResidue(input: {
    account: AccountRecord;
    request: CloseAccountRequest;
    session: ClientSession;
  }): Promise<void> {
    const residue = fromStored(input.account.ledgerBalance);
    if (residue.isZero) return;
    if (residue.isNegative) throw overdrawn(input.account, residue);

    const target = await this.requireSweepTarget(input);

    await this.postings.post(
      movementEntries.internalTransfer({
        reference: `${CLOSURE_REFERENCE_PREFIX}${input.account.id}`,
        fromAccountId: input.account.id,
        toAccountId: target.id,
        amount: residue,
        description: 'Closing balance swept on account closure',
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { closureReason: input.request.reason },
      }),
      input.session,
    );
  }

  /** The sweep destination must be another live account of the same customer and currency. */
  private async requireSweepTarget(input: {
    account: AccountRecord;
    request: CloseAccountRequest;
    session: ClientSession;
  }): Promise<AccountRecord> {
    const targetId = input.request.sweepToAccountId;
    if (!targetId) throw notEmpty(input.account, 'nominate an account to sweep it to');

    const target = await this.accounts.findById(targetId, input.session);
    const usable =
      target &&
      target.id !== input.account.id &&
      isHeldBy(target, input.account.userId) &&
      target.currency === input.account.currency &&
      target.status === AccountStatus.ACTIVE;

    if (!usable) throw unusableSweepTarget();
    return target;
  }
}

/**
 * `holdTotal` is the guard rather than a query into the holds collection.
 *
 * The total is maintained by the holds module on this very document, inside the same
 * transaction that places or releases a hold, so it cannot disagree with the collection —
 * and reading it here means the accounts module does not have to depend on the module
 * that depends on it.
 */
function assertNoActiveHolds(account: AccountRecord): void {
  const held = fromStored(account.holdTotal);
  if (held.isZero) return;

  throw new AppError({
    code: ErrorCode.ACCOUNT_HAS_ACTIVE_HOLDS,
    message: `${held.format()} is on hold against this account. Release it or wait for it to expire, then close.`,
    context: { accountId: account.id, held: held.toJSON() },
  });
}

function overdrawn(account: AccountRecord, residue: Money): AppError {
  return notEmpty(account, `repay the ${residue.abs().format()} outstanding before closing`);
}

function notEmpty(account: AccountRecord, remedy: string): AppError {
  return new AppError({
    code: ErrorCode.ACCOUNT_NOT_EMPTY,
    message: `This account still holds a balance — ${remedy}.`,
    context: { accountId: account.id, balance: account.ledgerBalance },
  });
}

function unusableSweepTarget(): AppError {
  return AppError.validation('The closing balance cannot be swept to that account.', [
    {
      path: 'sweepToAccountId',
      message: 'Choose another of your own active accounts in the same currency',
    },
  ]);
}
