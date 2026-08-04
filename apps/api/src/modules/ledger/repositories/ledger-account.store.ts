import { type ClientSession } from 'mongoose';

import { type LedgerAccountType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type StoredMoney } from '../../../common/money/money.codec.js';

/**
 * What a service is allowed to know about the chart of accounts.
 *
 * Same reasoning as {@link import('./journal-entry.store.js').JournalEntryStore}: an
 * abstract class doubles as the Nest injection token and the compile-time type, and the
 * in-memory implementation used by the tests is a first-class citizen rather than a mock.
 */
export abstract class LedgerAccountStore {
  abstract findByCode(code: string, session?: ClientSession): Promise<LedgerAccountRecord | null>;

  abstract listAll(session?: ClientSession): Promise<LedgerAccountRecord[]>;

  /**
   * Creates the account if it is absent, refreshes its descriptive fields if it is not.
   *
   * Never touches `balances`. Re-seeding the chart of accounts against a live bank is a
   * routine deployment step, and it must not be capable of zeroing the books.
   */
  abstract ensure(input: NewLedgerAccount, session?: ClientSession): Promise<EnsureOutcome>;

  /**
   * Adds `delta` to the account's balance in `delta.currency`.
   *
   * The session is **required**, not optional. This is a read-modify-write — Mongo cannot
   * `$inc` a string-encoded bigint — and outside a transaction two concurrent postings
   * would each read the same starting balance and one of them would vanish. Inside one,
   * the server detects the conflict and `TransactionRunner` replays the whole callback.
   */
  abstract applyEffect(input: LedgerEffectInput): Promise<void>;

  /** Every account holding a balance in `currency`, for the trial balance. */
  abstract trialBalance(input: TrialBalanceQuery): Promise<TrialBalanceRow[]>;
}

export interface LedgerAccountRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly isControlAccount: boolean;
  /** Signed per-currency balance, positive meaning "increased on its normal side". */
  readonly balances: Readonly<Record<string, StoredMoney>>;
}

export type NewLedgerAccount = Omit<LedgerAccountRecord, 'id' | 'balances'>;

/** Distinguishes the three idempotent seed outcomes so a run can report what it did. */
export type EnsureOutcome = {
  readonly record: LedgerAccountRecord;
  readonly result: 'created' | 'updated' | 'unchanged';
};

export interface LedgerEffectInput {
  readonly code: string;
  readonly delta: Money;
  readonly session: ClientSession;
}

export interface TrialBalanceQuery {
  readonly currency: string;
  readonly session?: ClientSession;
}

export interface TrialBalanceRow {
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly balance: StoredMoney;
}
