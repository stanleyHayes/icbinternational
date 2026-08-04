import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  AccountStore,
  BalanceWriteConflictError,
  assertAccountUsable,
  computeAvailability,
  accountNotFound,
  type AccountRecord,
  type AvailabilitySnapshot,
} from '../accounts/index.js';

/**
 * The gate every spend passes through.
 *
 * `computeAvailability` (in the accounts module, beside the fields it reads) is the
 * arithmetic; this service is the enforcement, and it is the only thing in the system
 * permitted to move `holdTotal`. Splitting them that way keeps one definition of
 * availability while letting the mapper that renders a balance and the guard that refuses
 * a spend share it without the accounts module having to depend on holds.
 *
 * ## Why this is correct under concurrency
 *
 * Every method here reads the account **inside the caller's session** and writes it back
 * conditionally on the `version` it read. Two card authorisations racing on the same
 * account therefore cannot both see the same headroom and both take it:
 *
 * 1. Both read the account at version *n* and both find the funds sufficient.
 * 2. Both attempt the write conditional on *n*. MongoDB serialises them; one commits at
 *    *n+1* and the other is refused — by the server as a `WriteConflict` inside a
 *    transaction, and by the version guard in any case.
 * 3. The loser raises `BalanceWriteConflictError`, which `TransactionRunner` recognises as
 *    transient and retries **from the top** — re-reading the account, now at *n+1*, and
 *    re-running the funds check against the reduced availability.
 * 4. The second hold is then either placed against what is genuinely left, or refused
 *    with `INSUFFICIENT_FUNDS`.
 *
 * The critical detail is that the check and the write are one unit of work over one read.
 * A caller that checked availability, awaited something else and then reserved would have
 * a window, which is why {@link reserve} does its own check rather than trusting a prior
 * call to {@link assertSufficientFunds}.
 */
@Injectable()
export class BalanceService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly clock: ClockService,
  ) {}

  /** Ledger, held, overdraft and spendable figures for an account. */
  async snapshot(accountId: string, session?: ClientSession): Promise<AvailabilitySnapshot> {
    return computeAvailability(await this.require(accountId, session));
  }

  /**
   * Refuses unless the account can cover `amount` right now.
   *
   * Read inside the caller's session, always: a funds check against a snapshot outside
   * the transaction that spends the money is a check against a balance that no longer
   * exists.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND`, `ACCOUNT_CLOSED`, `ACCOUNT_FROZEN`,
   *   `CURRENCY_MISMATCH` or `INSUFFICIENT_FUNDS`.
   */
  async assertSufficientFunds(
    accountId: string,
    amount: Money,
    session: ClientSession,
  ): Promise<AvailabilitySnapshot> {
    const account = await this.require(accountId, session);
    return assertCovers(account, amount);
  }

  /**
   * Moves `amount` from spendable to held, atomically with the funds check.
   *
   * @throws {AppError} as {@link assertSufficientFunds}.
   * @throws {BalanceWriteConflictError} when the account moved under us; the caller's
   *   transaction is retried and the check is re-run against the new balance.
   */
  async reserve(input: BalanceMoveInput): Promise<void> {
    const account = await this.require(input.accountId, input.session);
    const snapshot = assertCovers(account, input.amount);

    await this.write({
      account,
      held: snapshot.held.plus(input.amount),
      net: snapshot.net.minus(input.amount),
      ledger: snapshot.ledger,
      session: input.session,
    });
  }

  /**
   * Returns `amount` from held to spendable.
   *
   * Deliberately does not re-check availability: giving money back can never make an
   * account worse off, and refusing to do so because of some other rule would strand the
   * customer's funds.
   */
  async restore(input: BalanceMoveInput): Promise<void> {
    const account = await this.require(input.accountId, input.session);
    const snapshot = computeAvailability(account);
    assertReserveExists(account, snapshot.held, input.amount);

    await this.write({
      account,
      held: snapshot.held.minus(input.amount),
      net: snapshot.net.plus(input.amount),
      ledger: snapshot.ledger,
      session: input.session,
    });
  }

  private async write(input: {
    account: AccountRecord;
    ledger: Money;
    net: Money;
    held: Money;
    session: ClientSession;
  }): Promise<void> {
    const written = await this.accounts.writeBalances({
      accountId: input.account.id,
      expectedVersion: input.account.version,
      ledgerBalance: input.ledger,
      // The stored `availableBalance` is exactly `ledger − holdTotal`; the overdraft
      // facility is added at read time and never baked into a stored figure.
      availableBalance: input.net,
      holdTotal: input.held,
      lastActivityAt: this.clock.now(),
      session: input.session,
    });

    if (!written) throw new BalanceWriteConflictError(input.account.id);
  }

  private async require(accountId: string, session?: ClientSession): Promise<AccountRecord> {
    const account = await this.accounts.findById(accountId, session);
    if (!account) throw accountNotFound(accountId);
    return account;
  }
}

/** An amount to move between the spendable and held parts of one account's balance. */
export interface BalanceMoveInput {
  readonly accountId: string;
  readonly amount: Money;
  readonly session: ClientSession;
}

function assertCovers(account: AccountRecord, amount: Money): AvailabilitySnapshot {
  assertAccountUsable(account);
  assertSameCurrency(account, amount);

  const snapshot = computeAvailability(account);
  if (snapshot.available.greaterThanOrEqual(amount)) return snapshot;

  throw new AppError({
    code: ErrorCode.INSUFFICIENT_FUNDS,
    message: `There isn't enough available in this account — ${snapshot.available.format()} of ${amount.format()}.`,
    context: {
      accountId: account.id,
      available: snapshot.available.toJSON(),
      requested: amount.toJSON(),
    },
  });
}

function assertSameCurrency(account: AccountRecord, amount: Money): void {
  if (account.currency === (amount.currency as string)) return;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `A ${amount.currency} amount cannot be held against a ${account.currency} account.`,
    context: { accountId: account.id, accountCurrency: account.currency },
  });
}

/**
 * Releasing more than is held would mint availability out of nothing.
 *
 * Unreachable unless `holdTotal` and the holds collection have diverged, which is a
 * defect rather than a customer error — so it is reported as one, loudly, instead of
 * being clamped into a plausible-looking number that hides the drift.
 */
function assertReserveExists(account: AccountRecord, held: Money, amount: Money): void {
  if (held.greaterThanOrEqual(amount)) return;

  throw new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: 'A hold was released against an account that is not holding that much.',
    context: { accountId: account.id, held: held.toJSON(), releasing: amount.toJSON() },
  });
}
