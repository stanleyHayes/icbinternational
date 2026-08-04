import { type ClientSession } from 'mongoose';

import { type DisputeReason, type DisputeStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { type PageResult } from '../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about dispute persistence.
 *
 * An abstract class rather than an interface because Nest resolves it as both an
 * injection token and a type. Services never see a Mongoose document — only this plain
 * record — so no handler can mutate a case outside the store's targeted writes.
 */
export abstract class DisputeStore {
  /** Writes a new case. The unique `transactionId` index rejects a second dispute. */
  abstract insert(row: NewDispute, session?: ClientSession): Promise<DisputeRecord>;

  abstract findByPublicId(id: string, session?: ClientSession): Promise<DisputeRecord | null>;

  /** The scheme rule "one dispute per transaction", as a lookup. */
  abstract findByTransactionId(
    transactionId: string,
    session?: ClientSession,
  ): Promise<DisputeRecord | null>;

  /** The customer's own disputes, newest first. */
  abstract listForUser(query: DisputeListQuery): Promise<PageResult<DisputeRecord>>;

  /** The operations queue, oldest first so the longest-waiting case is worked next. */
  abstract listForAdmin(query: DisputeListQuery): Promise<PageResult<DisputeRecord>>;

  /**
   * Applies a targeted patch and appends a timeline step in one write.
   *
   * Returns the updated record, or `null` when the dispute no longer exists. The
   * timeline append rides the same update so a state change can never be recorded
   * without its history entry, or vice versa.
   */
  abstract applyTransition(
    input: DisputeTransition,
    session?: ClientSession,
  ): Promise<DisputeRecord | null>;
}

/** One history step, as persisted. */
export interface DisputeTimelineRecord {
  readonly status: DisputeStatus;
  readonly at: Date;
  readonly detail: string;
}

/** A persisted dispute as services see it. */
export interface DisputeRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly status: DisputeStatus;
  readonly reason: DisputeReason;
  readonly description: string;
  readonly disputedAmount: StoredMoney;
  readonly provisionalCredit: StoredMoney | null;
  readonly provisionalCreditAt: Date | null;
  readonly provisionalCreditEntryId: string | null;
  readonly resolutionEntryId: string | null;
  readonly evidenceIds: readonly string[];
  readonly merchantResponse: string | null;
  readonly outcomeSummary: string | null;
  readonly contactedMerchant: boolean;
  readonly timeline: readonly DisputeTimelineRecord[];
  readonly merchantResponseDueAt: Date;
  readonly decisionDueAt: Date;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

/** A case on its way in: the caller supplies everything except the minted id. */
export type NewDispute = Omit<DisputeRecord, 'id'>;

/** A cursor page over disputes. `userId` present scopes the query to one customer. */
export interface DisputeListQuery {
  readonly userId?: string;
  readonly status?: DisputeStatus;
  readonly cursor?: string;
  readonly limit: number;
}

/**
 * A targeted write to a case.
 *
 * `set` carries the fields changing with the transition; `timelineEntry` the history
 * step that explains why. Both are applied atomically.
 */
export interface DisputeTransition {
  readonly id: string;
  readonly set: Partial<
    Pick<
      DisputeRecord,
      | 'status'
      | 'provisionalCredit'
      | 'provisionalCreditAt'
      | 'provisionalCreditEntryId'
      | 'resolutionEntryId'
      | 'merchantResponse'
      | 'outcomeSummary'
      | 'resolvedAt'
    >
  >;
  /** Additional evidence ids to append, when the transition carries new evidence. */
  readonly appendEvidenceIds?: readonly string[];
  readonly timelineEntry: DisputeTimelineRecord;
}
