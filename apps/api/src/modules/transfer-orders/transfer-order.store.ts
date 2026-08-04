import { type ClientSession } from 'mongoose';

import { type RecurrenceFrequency, type TransferOrderStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { type PageResult } from '../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about standing-order persistence.
 *
 * {@link patch} is the only mutation, and it carries a status precondition into the write.
 * Every change a customer can make to a live order — pause, resume, skip, amend, cancel —
 * is a conditional update naming the statuses it is willing to act on, so a cancellation
 * and a skip that arrive together resolve in the database rather than in whichever handler
 * happened to read first. Skipping an order that was cancelled a moment ago matches
 * nothing and changes nothing, which is the only answer that leaves the customer's
 * instruction intact.
 */
export abstract class TransferOrderStore {
  abstract insert(order: NewTransferOrder, session?: ClientSession): Promise<TransferOrderRecord>;

  /** The order, only if this customer holds it. Null covers "not theirs" and "not there". */
  abstract findOwnedById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<TransferOrderRecord | null>;

  abstract list(query: TransferOrderListQuery): Promise<PageResult<TransferOrderRecord>>;

  /** Applies a change, and only from one of `expectedStatuses`. Null means the guard held. */
  abstract patch(input: TransferOrderPatch): Promise<TransferOrderRecord | null>;

  /**
   * Active orders whose next payment is due, oldest first.
   *
   * The read the run engine works from. Nothing in this module calls it: executing a
   * standing order books money, and the lane that books it owns that decision. What lives
   * here is the query and the index behind it, so the engine reads the same definition of
   * "due" that the customer's next-payment date was written from.
   */
  abstract dueForRun(at: Date, limit: number): Promise<readonly TransferOrderRecord[]>;
}

/** A persisted standing order as services see it. */
export interface TransferOrderRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly status: TransferOrderStatus;
  readonly sourceAccountId: string;
  readonly beneficiaryId: string;
  readonly amount: StoredMoney;
  readonly reference: string | null;
  readonly frequency: RecurrenceFrequency;
  /** Day of month 1–31 for a monthly, quarterly or annual order; null otherwise. */
  readonly dayOfMonth: number | null;
  /** ISO weekday 1–7 for a weekly or fortnightly order; null otherwise. */
  readonly dayOfWeek: number | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly maxOccurrences: number | null;
  readonly occurrencesRun: number;
  /** Midnight UTC on the next payment date. Null once the schedule has nothing left to run. */
  readonly nextRunAt: Date | null;
  readonly lastRunAt: Date | null;
  readonly consecutiveFailures: number;
  readonly createdAt: Date;
}

/** An order on its way in: active, never run, nothing failed. */
export type NewTransferOrder = Omit<
  TransferOrderRecord,
  'id' | 'status' | 'occurrencesRun' | 'lastRunAt' | 'consecutiveFailures'
>;

export interface TransferOrderListQuery {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly status?: TransferOrderStatus;
  readonly sourceAccountId?: string;
}

/** The fields a customer's own actions can move. Everything else is set once, at creation. */
export interface TransferOrderPatchFields {
  readonly status?: TransferOrderStatus;
  readonly nextRunAt?: Date | null;
  readonly name?: string;
  readonly amount?: StoredMoney;
  readonly reference?: string | null;
  readonly endsOn?: string | null;
  readonly maxOccurrences?: number | null;
}

export interface TransferOrderPatch {
  readonly id: string;
  readonly userId: string;
  readonly expectedStatuses: readonly TransferOrderStatus[];
  readonly fields: TransferOrderPatchFields;
  readonly session?: ClientSession;
}
