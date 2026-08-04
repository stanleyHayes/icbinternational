import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AccountStatus, ErrorCode } from '@reliance/contracts';
import { type CurrencyCode, type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import {
  AccountBalancePort,
  type AccountDeltaInput,
} from '../ledger/ports/account-balance.port.js';

import { assertAccountUsable } from './account-status.rules.js';
import { accountNotFound } from './account.service.js';
import { AccountStore, type AccountRecord } from './account.store.js';
import { BalanceWriteConflictError } from './concurrency.js';

/**
 * The ledger's window onto customer balances, backed by the `accounts` collection.
 *
 * This is the binding the ledger asked for in `docs/HANDOFFS.md`: it must be able to move
 * a customer balance without importing the module that owns the collection, so it
 * declares the port and the accounts module supplies it. The direction is deliberate —
 * accounts cannot exist without a ledger, but the ledger is complete without accounts.
 *
 * Which statuses may be posted to is decided by `assertAccountUsable`, shared with the
 * holds module so that a frozen account cannot be judged differently by the two of them.
 */
@Injectable()
export class MongoAccountBalancePort extends AccountBalancePort {
  constructor(
    private readonly accounts: AccountStore,
    private readonly clock: ClockService,
  ) {
    super();
  }

  /**
   * Moves `ledgerBalance` and `availableBalance` by the same signed delta.
   *
   * Both move together because a posting is settled money. A hold moves availability
   * alone and is the holds module's business; by the time a posting lands the customer
   * has either been paid or has paid, and pretending otherwise for even one read would
   * let the same pound be spent twice.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` or `CURRENCY_MISMATCH`.
   * @throws {BalanceWriteConflictError} when the account moved under us — the caller's
   *   transaction is retried and the delta is applied to the new balance.
   */
  override async applyDelta(input: AccountDeltaInput): Promise<void> {
    const account = await this.require(input.accountId, input.session);
    assertSameCurrency(account, input.delta);

    const ledgerBalance = fromStored(account.ledgerBalance).plus(input.delta);
    const availableBalance = fromStored(account.availableBalance).plus(input.delta);

    assertWithinFloor({ account, delta: input.delta, ledgerBalance });

    const written = await this.accounts.writeBalances({
      accountId: account.id,
      expectedVersion: account.version,
      ledgerBalance,
      availableBalance,
      holdTotal: fromStored(account.holdTotal),
      ...transitionFor(account, ledgerBalance),
      lastActivityAt: this.clock.now(),
      session: input.session,
    });

    if (!written) throw new BalanceWriteConflictError(account.id);
  }

  /**
   * Refuses a posting to an account that cannot legally receive one.
   *
   * Checked before anything is written, so a frozen account aborts the transaction while
   * there is still nothing to unwind — rather than leaving a journal entry that has to be
   * reversed, which is a permanent mark on a statement for a movement that never happened.
   */
  override async assertPostable(accountId: string, session: ClientSession): Promise<void> {
    assertAccountUsable(await this.require(accountId, session));
  }

  override async currentBalance(accountId: string, session?: ClientSession): Promise<Money | null> {
    const account = await this.accounts.findById(accountId, session);
    return account ? fromStored(account.ledgerBalance) : null;
  }

  private async require(accountId: string, session?: ClientSession): Promise<AccountRecord> {
    const account = await this.accounts.findById(accountId, session);
    if (!account) throw accountNotFound(accountId);
    return account;
  }
}

/**
 * The status change, if any, that this posting causes.
 *
 * Two transitions ride along with the balance write rather than living in a separate
 * update, because both are consequences of the posting and must commit with it. A
 * separate write could fail on its own and leave an account that has met its minimum
 * still stuck at `PENDING`.
 */
function transitionFor(
  account: AccountRecord,
  ledgerBalance: Money,
): { status?: AccountStatus; dormantAt?: null } {
  if (account.status === AccountStatus.DORMANT) {
    return { status: AccountStatus.ACTIVE, dormantAt: null };
  }

  const activates =
    account.status === AccountStatus.PENDING &&
    ledgerBalance.greaterThanOrEqual(fromStored(account.minimumOpeningBalance));

  return activates ? { status: AccountStatus.ACTIVE } : {};
}

/**
 * A GBP posting must never land on a USD account.
 *
 * `Money.plus` would throw on its own, but a `CurrencyMismatchError` from the money
 * package reaches the exception filter as an internal error. Raising the contract's own
 * code here makes it a legible rejection with both currencies named.
 */
function assertSameCurrency(account: AccountRecord, delta: Money): void {
  if (account.currency === (delta.currency as string)) return;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `A ${delta.currency} posting cannot be applied to a ${account.currency} account.`,
    context: { accountId: account.id, accountCurrency: account.currency as CurrencyCode },
  });
}

/**
 * The last line of defence against a debit that overdraws an account.
 *
 * Callers are supposed to check funds before they post — transfers, bill payments, FX and
 * mandates all do, through `BalanceService.assertSufficientFunds`. Savings goals, loan
 * repayments and deposit placements did not, and nothing stopped them: `assertPostable`
 * only checks account *status*, and the balance write applied whatever delta it was given.
 * An adversarial review found all three could drive an account arbitrarily negative.
 *
 * Enforcing it here rather than adding a fourth call to the three offenders is deliberate.
 * A rule that every caller must remember is a rule that the next caller will forget, and
 * this one is reached by every posting on every path. Callers should still check first —
 * a pre-flight check gives a better error and avoids an aborted transaction — but the
 * ledger no longer depends on them doing so.
 *
 * The floor is the overdraft facility, not zero: an arranged overdraft is money the
 * customer may legitimately spend.
 */
function assertWithinFloor(input: {
  account: AccountRecord;
  delta: Money;
  ledgerBalance: Money;
}): void {
  if (!input.delta.isNegative) return;

  const floor = fromStored(input.account.overdraftLimit).negate();
  if (input.ledgerBalance.greaterThanOrEqual(floor)) return;

  throw new AppError({
    code: ErrorCode.INSUFFICIENT_FUNDS,
    message: "There isn't enough available in this account to cover that.",
    context: {
      accountId: input.account.id,
      attempted: input.delta.toString(),
      wouldLeave: input.ledgerBalance.toString(),
      floor: floor.toString(),
    },
  });
}
