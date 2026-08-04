import { Injectable } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';

import { AccountBalancePort, type AccountDeltaInput } from './account-balance.port.js';

/**
 * An honest, in-memory `AccountBalancePort`.
 *
 * "Honest" is the important word: it enforces the same rules the real adapter must —
 * unknown accounts are rejected, closed and frozen accounts refuse postings, currencies
 * may not be mixed — so a test that passes against this one is testing the ledger's
 * behaviour rather than the fake's leniency.
 *
 * It is shipped in `src`, not in a test folder, because the seed and simulation
 * workstreams need a balance sink before the accounts module exists, and because a fake
 * that lives with its port cannot drift away from it unnoticed.
 */
@Injectable()
export class InMemoryAccountBalancePort extends AccountBalancePort {
  private readonly accounts = new Map<string, MutableBalance>();

  /** Registers an account so it can be posted to. Mirrors "open an account". */
  open(input: { accountId: string; opening: Money; status?: FakeAccountStatus }): void {
    this.accounts.set(input.accountId, {
      ledgerBalance: input.opening,
      availableBalance: input.opening,
      status: input.status ?? 'ACTIVE',
    });
  }

  /** Forces a status so a test can prove a frozen account rejects a posting. */
  setStatus(accountId: string, status: FakeAccountStatus): void {
    this.accounts.set(accountId, { ...this.require(accountId), status });
  }

  /**
   * Corrupts a stored balance without a matching posting.
   *
   * This is the only way to prove the verifier actually detects drift. Real drift comes
   * from a bug or a manual write; injecting it deliberately is how we know the alarm is
   * wired to something.
   */
  injectDrift(accountId: string, drift: Money): void {
    const current = this.require(accountId);
    this.accounts.set(accountId, {
      ...current,
      ledgerBalance: current.ledgerBalance.plus(drift),
      availableBalance: current.availableBalance.plus(drift),
    });
  }

  /** Snapshot for assertions. */
  balanceOf(accountId: string): Money {
    return this.require(accountId).ledgerBalance;
  }

  availableOf(accountId: string): Money {
    return this.require(accountId).availableBalance;
  }

  override async applyDelta(input: AccountDeltaInput): Promise<void> {
    const current = this.require(input.accountId);
    // `Money.plus` throws on a currency mismatch, which is the behaviour we want the real
    // adapter to have too: a GBP posting must never land on a USD account.
    this.accounts.set(input.accountId, {
      ...current,
      ledgerBalance: current.ledgerBalance.plus(input.delta),
      availableBalance: current.availableBalance.plus(input.delta),
    });
  }

  override async assertPostable(accountId: string): Promise<void> {
    const account = this.require(accountId);

    if (account.status === 'CLOSED') {
      throw new AppError({
        code: ErrorCode.ACCOUNT_CLOSED,
        message: `Account ${accountId} is closed and cannot be posted to.`,
      });
    }
    if (account.status === 'FROZEN') {
      throw new AppError({
        code: ErrorCode.ACCOUNT_FROZEN,
        message: `Account ${accountId} is frozen and cannot be posted to.`,
      });
    }
  }

  override async currentBalance(accountId: string): Promise<Money | null> {
    return this.accounts.get(accountId)?.ledgerBalance ?? null;
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.accounts.clear();
  }

  private require(accountId: string): MutableBalance {
    const account = this.accounts.get(accountId);
    if (!account) throw AppError.notFound('Account', accountId);
    return account;
  }
}

export type FakeAccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

interface MutableBalance {
  readonly ledgerBalance: Money;
  readonly availableBalance: Money;
  readonly status: FakeAccountStatus;
}
