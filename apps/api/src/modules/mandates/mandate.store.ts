import { type ClientSession } from 'mongoose';

import { type MandateStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

import { type MandateFrequency } from './mandate.constants.js';

/**
 * One collection a merchant took under a mandate.
 *
 * Identified by its journal entry rather than by an id of its own. The entry is what
 * actually moved the money, it is already globally unique, and a dispute is a claim about a
 * movement — pointing at anything else would add an identifier that could disagree with the
 * one that matters.
 */
export interface MandateCollection {
  readonly journalEntryId: string;
  readonly settlementEntryId: string | null;
  readonly transactionId: string | null;
  readonly amount: StoredMoney;
  readonly collectedAt: Date;
  /** Set when the customer claimed under the guarantee and was refunded. */
  readonly refundedAt: Date | null;
  readonly refundEntryId: string | null;
  readonly refundReason: string | null;
}

/**
 * What a service is allowed to know about mandate persistence.
 *
 * {@link transition} carries the status precondition into the write. "Cancelling blocks the
 * next collection" is only true if the cancel and the collect cannot both succeed on a
 * mandate they each read as live — so the collection claims the mandate with a conditional
 * update naming `ACTIVE`, and a cancellation that lands first makes that update match
 * nothing.
 */
export abstract class MandateStore {
  abstract insert(mandate: NewMandate, session?: ClientSession): Promise<MandateRecord>;

  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<MandateRecord | null>;

  /** The mandate regardless of who holds it. For the collection sweep only. */
  abstract findByIdUnscoped(id: string, session?: ClientSession): Promise<MandateRecord | null>;

  abstract list(query: MandateListQuery): Promise<readonly MandateRecord[]>;

  /** Moves a mandate to a new status, and only from one of `fromStatuses`. */
  abstract transition(input: MandateTransition): Promise<MandateRecord | null>;

  /**
   * Records a collection against a live mandate, and only against a live one.
   *
   * Returns null when the mandate has been paused, cancelled or has expired. This is the
   * write that makes cancellation binding.
   */
  abstract recordCollection(input: RecordCollectionInput): Promise<MandateRecord | null>;

  /** Marks one collection refunded under the guarantee. */
  abstract recordRefund(input: RecordRefundInput): Promise<MandateRecord | null>;

  /** Active mandates whose next collection is due, for the sweep. */
  abstract dueForCollection(at: Date, limit: number): Promise<readonly MandateRecord[]>;
}

/** A persisted mandate as services see it. */
export interface MandateRecord {
  readonly id: string;
  readonly userId: string;
  readonly status: MandateStatus;
  readonly merchantName: string;
  readonly merchantLogoUrl: string | null;
  readonly accountId: string;
  /** The merchant's own reference, printed on the customer's statement. */
  readonly reference: string;
  /** Null for a variable-amount mandate such as a utility bill. */
  readonly fixedAmount: StoredMoney | null;
  /** The ceiling the customer agreed to. A collection above it is refused. */
  readonly maxAmount: StoredMoney | null;
  readonly frequency: MandateFrequency;
  readonly lastCollectedAt: Date | null;
  readonly lastAmount: StoredMoney | null;
  readonly nextExpectedAt: Date | null;
  readonly collections: readonly MandateCollection[];
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
}

/** A mandate on its way in: active, never collected, nothing disputed. */
export type NewMandate = Omit<
  MandateRecord,
  'id' | 'status' | 'lastCollectedAt' | 'lastAmount' | 'collections' | 'cancelledAt'
>;

export interface MandateListQuery {
  readonly userId: string;
  readonly limit: number;
  readonly status?: MandateStatus;
  readonly accountId?: string;
}

export interface MandateTransition {
  readonly id: string;
  readonly userId: string;
  readonly fromStatuses: readonly MandateStatus[];
  readonly status: MandateStatus;
  readonly cancelledAt?: Date | null;
  readonly session?: ClientSession;
}

export interface RecordCollectionInput {
  readonly mandateId: string;
  readonly collection: MandateCollection;
  readonly nextExpectedAt: Date | null;
  readonly session?: ClientSession;
}

export interface RecordRefundInput {
  readonly mandateId: string;
  readonly journalEntryId: string;
  readonly refundEntryId: string;
  readonly refundReason: string;
  readonly refundedAt: Date;
  readonly session?: ClientSession;
}
