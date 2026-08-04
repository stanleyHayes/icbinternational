import { type ClientSession } from 'mongoose';

import {
  type EntryType,
  type JournalEntryStatus,
  type PostingDirection,
} from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import { type PageResult } from '../../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about journal-entry persistence.
 *
 * Services depend on this abstract class, not on the Mongoose repository that implements
 * it (§2.3: "a service never touches a Mongoose model directly — it goes through a
 * repository interface"). An abstract class rather than a TypeScript interface because
 * Nest can use it as an injection token *and* a type, so there is no stringly-typed
 * `@Inject('JOURNAL_ENTRY_STORE')` to keep in sync.
 *
 * The payoff is concrete: every service test in this module runs against an in-memory
 * implementation in milliseconds, with no replica set and no mocking framework.
 */
export abstract class JournalEntryStore {
  /**
   * Writes a new entry and mints its public `jnl_` id.
   *
   * The id is assigned here rather than by the caller because it is a persistence
   * concern, and because a caller holding an id for a record that was never written is
   * a bug waiting to be logged.
   */
  abstract insert(entry: NewJournalEntry, session?: ClientSession): Promise<JournalEntryRecord>;

  /** The idempotency lookup. `reference` is unique across the collection. */
  abstract findByReference(
    reference: string,
    session?: ClientSession,
  ): Promise<JournalEntryRecord | null>;

  abstract findByPublicId(id: string, session?: ClientSession): Promise<JournalEntryRecord | null>;

  /** Newest-first page of every entry with a posting against `accountId`. */
  abstract findByAccount(query: AccountEntryQuery): Promise<PageResult<JournalEntryRecord>>;

  /** Everything booked at or after `since`, oldest first. Feeds incremental reconciliation. */
  abstract findSince(since: Date, session?: ClientSession): Promise<JournalEntryRecord[]>;

  /**
   * Ordered batch read for a full replay, keyed on the public id.
   *
   * Cursoring on a monotonic ULID rather than a skip/limit means the verifier cannot miss
   * or re-count an entry that was inserted while it was running.
   */
  abstract scanFrom(options: EntryScanOptions): Promise<JournalEntryRecord[]>;

  /** Links an original to the entry that undid it. The only mutation this store permits. */
  abstract markReversed(input: MarkReversedInput): Promise<void>;
}

/** One leg, as persisted. Amounts are always positive; `direction` carries the sign. */
export interface PostingRecord {
  readonly ledgerAccountCode: string;
  readonly ledgerAccountName: string;
  readonly accountId: string | null;
  readonly direction: PostingDirection;
  readonly amount: StoredMoney;
  readonly narrative: string;
}

/**
 * A persisted journal entry as services see it — a plain, frozen-by-convention value.
 *
 * Deliberately not a Mongoose `HydratedDocument`: handing a service something with
 * `.save()` on it is handing it a way to mutate the system of record outside a
 * transaction.
 */
export interface JournalEntryRecord {
  readonly id: string;
  readonly reference: string;
  readonly type: EntryType;
  readonly status: JournalEntryStatus;
  readonly description: string;
  readonly valueDate: string;
  readonly bookedAt: Date;
  readonly postings: readonly PostingRecord[];
  readonly reversesEntryId: string | null;
  readonly reversedByEntryId: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

/** An entry on its way in: no id yet, and nothing has reversed it. */
export type NewJournalEntry = Omit<JournalEntryRecord, 'id' | 'reversedByEntryId'>;

export interface AccountEntryQuery {
  readonly accountId: string;
  readonly limit: number;
  /** Opaque cursor from a previous page. */
  readonly cursor?: string;
  readonly session?: ClientSession;
}

export interface EntryScanOptions {
  /** Exclusive lower bound on the public id. Omit to start at the beginning of time. */
  readonly afterId?: string;
  readonly limit: number;
  readonly session?: ClientSession;
}

export interface MarkReversedInput {
  readonly entryId: string;
  readonly reversedByEntryId: string;
  readonly session?: ClientSession;
}
