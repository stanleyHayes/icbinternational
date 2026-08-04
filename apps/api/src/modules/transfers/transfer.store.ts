import { type ClientSession } from 'mongoose';

import {
  type TransferDestination,
  type TransferRail,
  type TransferStatus,
} from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { type PageResult } from '../../common/pagination/cursor.js';

import { type TimelineEntry } from './transfer-timeline.js';

/**
 * What a service is allowed to know about transfer persistence.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token. The in-memory twin reproduces the unique index on `quoteId`, the
 * owner-scoped reads and the cursor ordering, which is what lets the execution path — the
 * part of this lane that can debit a customer twice — be tested exhaustively in
 * milliseconds against the same guarantees production relies on.
 */
export abstract class TransferStore {
  /**
   * Writes a transfer and mints its public `trf_` id.
   *
   * `quoteId` is unique across the collection. That index, not a check in a service, is
   * what makes "one quote, one transfer" true under concurrency: two executions of the
   * same quote race here and exactly one lands.
   */
  abstract insert(transfer: NewTransfer, session?: ClientSession): Promise<TransferRecord>;

  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<TransferRecord | null>;

  /** The transfer already booked against a quote, or null. The idempotency lookup. */
  abstract findByQuote(quoteId: string, session?: ClientSession): Promise<TransferRecord | null>;

  /** A cursor-paginated page of the customer's transfers, newest first. */
  abstract list(query: TransferListQuery): Promise<PageResult<TransferRecord>>;

  /**
   * Moves a transfer to a new status, and only from one of `fromStatuses`.
   *
   * Returns null when the transfer has already moved on. That conditional write is the
   * exactly-once guarantee for cancellation: two taps both read a cancellable transfer,
   * both try to cancel, and precisely one succeeds.
   */
  abstract transition(input: TransferTransitionInput): Promise<TransferRecord | null>;
}

/** A persisted transfer as services see it — a plain value, with no `.save()` on it. */
export interface TransferRecord {
  readonly id: string;
  readonly userId: string;
  /** The quote this execution is bound to. Unique; the reference is derived from it. */
  readonly quoteId: string;
  readonly rail: TransferRail;
  readonly status: TransferStatus;
  readonly sourceAccountId: string;
  readonly destination: TransferDestination;
  /** Set for an internal transfer; null once a rail leaves the bank. */
  readonly destinationAccountId: string | null;
  readonly debitAmount: StoredMoney;
  readonly creditAmount: StoredMoney;
  readonly fee: StoredMoney;
  readonly exchangeRate: string | null;
  readonly reference: string | null;
  readonly railReference: string | null;
  readonly returnCode: string | null;
  readonly returnReason: string | null;
  readonly journalEntryId: string | null;
  /** The separate `FEE` entry, when one was booked. */
  readonly feeJournalEntryId: string | null;
  readonly beneficiaryId: string | null;
  readonly timeline: readonly TimelineEntry[];
  readonly estimatedArrival: Date | null;
  readonly settledAt: Date | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: Date;
}

/** A transfer on its way in: no id yet, and nothing has been returned about it. */
export type NewTransfer = Omit<
  TransferRecord,
  'id' | 'returnCode' | 'returnReason' | 'railReference'
>;

export interface TransferListQuery {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly status?: TransferStatus;
  readonly rail?: TransferRail;
  readonly sourceAccountId?: string;
  readonly session?: ClientSession;
}

export interface TransferTransitionInput {
  readonly id: string;
  readonly userId: string;
  /** Only these statuses may be left. Anything else means somebody got there first. */
  readonly fromStatuses: readonly TransferStatus[];
  readonly status: TransferStatus;
  readonly event: TimelineEntry;
  readonly settledAt?: Date | null;
  readonly session?: ClientSession;
}
