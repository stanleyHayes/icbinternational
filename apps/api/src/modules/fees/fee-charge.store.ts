import { type ClientSession } from 'mongoose';

import { type FeeKind } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

import { type FeeChargeSource } from './fees.constants.js';

/**
 * What a service is allowed to know about fee-charge persistence.
 *
 * An abstract class rather than an interface so Nest can use it as an injection token
 * and a type at once — the same pattern as the ledger's `JournalEntryStore`.
 */
export abstract class FeeChargeStore {
  /**
   * Writes a new charge and mints its public `fee_` id.
   *
   * Throws a duplicate-key error when `chargeKey` already exists; the caller turns that
   * into a replay of the winning record.
   */
  abstract insert(charge: NewFeeCharge, session?: ClientSession): Promise<FeeChargeRecord>;

  /** The idempotency lookup. `chargeKey` is unique across the collection. */
  abstract findByChargeKey(
    chargeKey: string,
    session?: ClientSession,
  ): Promise<FeeChargeRecord | null>;

  /** An account's fee history, newest first. */
  abstract listByAccount(accountId: string, session?: ClientSession): Promise<FeeChargeRecord[]>;

  /**
   * Charged amounts summed per currency.
   *
   * Waived charges contribute their zero amount, so the total is exactly the money the
   * module has taken — the figure reconciliation compares against GL 4000.
   */
  abstract totalsByCurrency(session?: ClientSession): Promise<CurrencyTotal[]>;
}

/** A persisted fee charge as services see it. */
export interface FeeChargeRecord {
  readonly id: string;
  readonly accountId: string;
  readonly kind: FeeKind;
  readonly chargeKey: string;
  readonly periodKey: string | null;
  readonly amount: StoredMoney;
  readonly waivedBy: string | null;
  readonly journalEntryId: string | null;
  readonly source: FeeChargeSource;
  readonly sourceId: string | null;
  readonly description: string;
  readonly chargedAt: Date;
}

/** A charge on its way in: no id yet — minting ids is a persistence concern. */
export type NewFeeCharge = Omit<FeeChargeRecord, 'id'>;

/** One currency's summed charged amount, in minor units. */
export interface CurrencyTotal {
  readonly currency: string;
  readonly totalMinor: bigint;
}
