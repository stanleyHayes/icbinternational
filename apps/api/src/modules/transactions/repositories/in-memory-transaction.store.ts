import { IdGenerator } from '../../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../../common/pagination/cursor.js';

import {
  matchesListQuery,
  matchesRangeQuery,
  newestFirst,
  oldestFirst,
} from './in-memory-match.js';
import { unreadableCursor } from './transaction-filter.js';
import {
  type EntryAccountQuery,
  type LatestBeforeQuery,
  type NewTransaction,
  type TransactionListQuery,
  type TransactionPatch,
  type TransactionRangeQuery,
  type TransactionRecord,
  TransactionStore,
} from './transaction.store.js';

/**
 * An in-memory {@link TransactionStore} that enforces the same contract as MongoDB.
 *
 * "Honest" is the load-bearing word. It rejects a duplicate `(journalEntryId, accountId)`
 * with the same duplicate-key shape the unique index produces, it applies the customer
 * filter set with the same semantics, and it orders and cursors identically. A fake that
 * waived any of those would let a projector test pass against behaviour the real store
 * can never produce — and the projector's entire job is to be idempotent.
 *
 * Shipped in `src` rather than a test folder because the seed and simulation workstreams
 * need a transaction sink before Mongo is up, and because a fake that lives beside its
 * port cannot drift from it unnoticed.
 */
export class InMemoryTransactionStore extends TransactionStore {
  private readonly rows = new Map<string, TransactionRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(row: NewTransaction): Promise<TransactionRecord> {
    const clash = await this.findByEntryAndAccount({
      journalEntryId: row.journalEntryId,
      accountId: row.accountId,
    });
    if (clash) throw duplicateProjection(row.journalEntryId, row.accountId);

    const record: TransactionRecord = {
      ...row,
      id: this.ids.generate('transaction'),
      categoryOverridden: false,
      notes: null,
      attachmentIds: [],
      disputeId: null,
    };
    this.rows.set(record.id, record);
    return record;
  }

  override async findByEntryAndAccount(
    query: EntryAccountQuery,
  ): Promise<TransactionRecord | null> {
    return (
      this.all().find(
        (row) => row.journalEntryId === query.journalEntryId && row.accountId === query.accountId,
      ) ?? null
    );
  }

  override async findByPublicId(id: string): Promise<TransactionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  override async list(query: TransactionListQuery): Promise<PageResult<TransactionRecord>> {
    const matches = this.all()
      .filter((row) => matchesListQuery(row, query))
      .sort(newestFirst);
    const from = query.cursor ? cursorIndex(matches, query.cursor) : 0;

    return buildPage({
      records: matches.slice(from, from + query.limit + 1),
      limit: query.limit,
      toCursor: (row) => ({ sortValue: row.bookedAt.toISOString(), id: row.id }),
    });
  }

  override async patch(input: TransactionPatch): Promise<TransactionRecord | null> {
    const current = this.rows.get(input.id);
    if (!current || current.userId !== input.userId) return null;

    const updated: TransactionRecord = {
      ...current,
      ...(input.category === undefined
        ? {}
        : { category: input.category, categoryOverridden: true }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    };
    this.rows.set(updated.id, updated);
    return updated;
  }

  override async scanRange(query: TransactionRangeQuery): Promise<TransactionRecord[]> {
    return this.all()
      .filter((row) => matchesRangeQuery(row, query))
      .sort(oldestFirst)
      .slice(0, query.limit);
  }

  override async latestBefore(query: LatestBeforeQuery): Promise<TransactionRecord | null> {
    return (
      this.all()
        .filter(
          (row) =>
            row.userId === query.userId &&
            row.accountId === query.accountId &&
            row.bookedAt < query.before,
        )
        .sort(newestFirst)
        .at(0) ?? null
    );
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.rows.clear();
  }

  private all(): TransactionRecord[] {
    return [...this.rows.values()];
  }
}

/**
 * Where the next page starts.
 *
 * Resolved by locating the anchor row rather than by index arithmetic, because that is
 * what makes the fake prove the property the real cursor claims: rows inserted since the
 * cursor was issued shift the array, and the boundary must still land immediately after
 * the same record.
 */
function cursorIndex(rows: readonly TransactionRecord[], cursor: string): number {
  const anchor = decodeCursor(cursor);
  if (!anchor) throw unreadableCursor();

  const at = rows.findIndex((row) => row.id === anchor.id);
  // An anchor that no longer exists means the row was removed between pages. Everything
  // strictly older than the cursor's sort value is still the correct next page.
  if (at === -1) {
    const older = rows.findIndex((row) => row.bookedAt.toISOString() < anchor.sortValue);
    return older === -1 ? rows.length : older;
  }
  return at + 1;
}

const DUPLICATE_KEY_CODE = 11_000;

/**
 * The exact error shape the unique index produces, so the projector's recovery path is
 * exercised by the fake rather than only by an integration test against a replica set.
 */
function duplicateProjection(journalEntryId: string, accountId: string): Error {
  return Object.assign(
    new Error(
      `E11000 duplicate key error collection: transactions index: journalEntryId_1_accountId_1`,
    ),
    {
      code: DUPLICATE_KEY_CODE,
      keyPattern: { journalEntryId: 1, accountId: 1 },
      keyValue: { journalEntryId, accountId },
    },
  );
}
