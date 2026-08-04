import { type ClientSession } from 'mongoose';

import {
  type EntryType,
  type SpendCategory,
  type TransactionDirection,
  type TransactionStatus,
} from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import { type PageResult } from '../../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about transaction persistence.
 *
 * An abstract class rather than an interface because Nest resolves it as both an
 * injection token and a type, so no stringly-typed `@Inject('TRANSACTION_STORE')` has to
 * be kept in sync with anything.
 *
 * The payoff is the same one the ledger gets: every service and insight test in these two
 * modules runs against {@link InMemoryTransactionStore} in milliseconds, with no replica
 * set and no mocking framework — and because that fake enforces the same uniqueness and
 * ordering rules, a test that passes against it is testing behaviour rather than leniency.
 */
export abstract class TransactionStore {
  /**
   * Writes a new row and mints its public `txn_` id.
   *
   * The id is assigned here rather than by the caller because it is a persistence
   * concern, and because a caller holding an id for a row that was never written is a
   * bug waiting to be filed.
   *
   * @throws A duplicate-key error when `(journalEntryId, accountId)` already exists. The
   *   projector catches it and reads the winner's row — see its recovery path.
   */
  abstract insert(row: NewTransaction, session?: ClientSession): Promise<TransactionRecord>;

  /** The projector's idempotency lookup. */
  abstract findByEntryAndAccount(query: EntryAccountQuery): Promise<TransactionRecord | null>;

  abstract findByPublicId(id: string, session?: ClientSession): Promise<TransactionRecord | null>;

  /** Newest-first page under the customer's full filter set. */
  abstract list(query: TransactionListQuery): Promise<PageResult<TransactionRecord>>;

  /** Admin-only: newest-first page with no userId scope. */
  abstract listAdmin(query: AdminTransactionQuery): Promise<PageResult<TransactionRecord>>;

  /** Applies the only fields a customer may change. Returns null if the row is gone. */
  abstract patch(input: TransactionPatch): Promise<TransactionRecord | null>;

  /**
   * Oldest-first keyset batch over a date range, for insights and exports.
   *
   * Oldest-first because both consumers accumulate forwards through time, and keyset
   * rather than skip/limit because a row inserted mid-scan must not shift the window and
   * cause a spend total to double-count or drop a transaction.
   */
  abstract scanRange(query: TransactionRangeQuery): Promise<TransactionRecord[]>;

  /**
   * The most recent row on an account strictly before an instant, or null.
   *
   * Exists so a cashflow chart can open at the balance the account actually stood at
   * rather than at zero. Without it, every leading bucket in which nothing happened
   * reports a zero balance, which is not "unchanged" — it is wrong, and it is wrong in
   * the direction that alarms people.
   */
  abstract latestBefore(query: LatestBeforeQuery): Promise<TransactionRecord | null>;
}

/** Counterparty as persisted. Mirrors the contract's `counterpartySchema`. */
export interface CounterpartyRecord {
  readonly name: string;
  readonly merchantId: string | null;
  readonly mcc: string | null;
  readonly logoUrl: string | null;
  readonly accountNumberMasked: string | null;
  readonly country: string | null;
}

/**
 * A persisted transaction as services see it — a plain value, not a Mongoose document.
 *
 * Handing a service something with `.save()` on it hands it a way to write the projection
 * outside the projector, and the whole design here is that the projector is the only
 * writer of the money-bearing fields.
 */
export interface TransactionRecord {
  readonly id: string;
  readonly accountId: string;
  readonly journalEntryId: string;
  readonly userId: string;
  readonly direction: TransactionDirection;
  readonly status: TransactionStatus;
  readonly type: EntryType;
  /** Always positive. `direction` carries the sign. */
  readonly amount: StoredMoney;
  readonly runningBalance: StoredMoney;
  readonly originalAmount: StoredMoney | null;
  readonly exchangeRate: string | null;
  readonly description: string;
  readonly reference: string | null;
  readonly category: SpendCategory;
  readonly categoryOverridden: boolean;
  readonly counterparty: CounterpartyRecord | null;
  readonly notes: string | null;
  readonly attachmentIds: readonly string[];
  readonly disputeId: string | null;
  readonly bookedAt: Date;
  readonly completedAt: Date | null;
}

/** A row on its way in: no id yet, and nothing has disputed or annotated it. */
export type NewTransaction = Omit<
  TransactionRecord,
  'id' | 'notes' | 'attachmentIds' | 'disputeId' | 'categoryOverridden'
>;

export interface EntryAccountQuery {
  readonly journalEntryId: string;
  readonly accountId: string;
  readonly session?: ClientSession;
}

/**
 * The customer's filter set, always scoped to one owner.
 *
 * `userId` is not optional and is applied by the repository rather than the controller,
 * so there is no code path — present or future — that can list one customer's
 * transactions under another's session by forgetting a `where` clause.
 */
export interface TransactionListQuery {
  readonly userId: string;
  readonly accountId?: string;
  readonly direction?: TransactionDirection;
  readonly status?: TransactionStatus;
  readonly category?: SpendCategory;
  readonly type?: EntryType;
  readonly search?: string;
  /** Inclusive bounds on the absolute amount, in minor units as a digit string. */
  readonly minAmount?: string;
  readonly maxAmount?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly cursor?: string;
  readonly limit: number;
}

export interface TransactionRangeQuery {
  readonly userId: string;
  readonly accountId?: string;
  readonly from: Date;
  readonly to: Date;
  /** Exclusive lower bound on the public id, for the next keyset batch. */
  readonly afterId?: string;
  readonly limit: number;
}

export interface LatestBeforeQuery {
  readonly userId: string;
  readonly accountId: string;
  /** Exclusive upper bound: rows booked strictly earlier than this. */
  readonly before: Date;
}

/** The only fields a customer owns on a row the ledger produced. */
export interface TransactionPatch {
  readonly id: string;
  readonly userId: string;
  readonly category?: SpendCategory;
  readonly notes?: string | null;
  readonly session?: ClientSession;
}

/** Admin-only transaction listing — no userId scope filter. */
export interface AdminTransactionQuery {
  readonly cursor?: string;
  readonly limit: number;
}
