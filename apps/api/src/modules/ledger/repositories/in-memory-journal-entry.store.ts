import { ErrorCode, JournalEntryStatus } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../../common/pagination/cursor.js';

import {
  JournalEntryStore,
  type AccountEntryQuery,
  type EntryScanOptions,
  type JournalEntryRecord,
  type MarkReversedInput,
  type NewJournalEntry,
} from './journal-entry.store.js';

/**
 * An in-memory {@link JournalEntryStore} that enforces the same contract as MongoDB.
 *
 * It exists so every service test in this module runs in milliseconds with no replica
 * set — and it is deliberately *not* lenient: references are unique, reversed entries
 * refuse a second reversal, scans come back in id order. A fake that waived those rules
 * would let a service test pass against behaviour the real store can never produce.
 */
export class InMemoryJournalEntryStore extends JournalEntryStore {
  private readonly records = new Map<string, JournalEntryRecord>();
  private insertionOrder: string[] = [];

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  /** Writes the entry, refusing a duplicate `reference` exactly as the unique index would. */
  override async insert(entry: NewJournalEntry): Promise<JournalEntryRecord> {
    const duplicate = await this.findByReference(entry.reference);
    if (duplicate) {
      throw duplicateReference(entry.reference);
    }

    const record: JournalEntryRecord = {
      ...entry,
      id: this.ids.generate('journalEntry'),
      reversedByEntryId: null,
    };
    this.records.set(record.id, record);
    this.insertionOrder.push(record.id);
    return record;
  }

  override async findByReference(reference: string): Promise<JournalEntryRecord | null> {
    return this.all().find((record) => record.reference === reference) ?? null;
  }

  override async findByPublicId(id: string): Promise<JournalEntryRecord | null> {
    return this.records.get(id) ?? null;
  }

  override async findByAccount(query: AccountEntryQuery): Promise<PageResult<JournalEntryRecord>> {
    const matches = this.all()
      .filter((record) => record.postings.some((p) => p.accountId === query.accountId))
      .sort(descending);

    const from = query.cursor ? this.cursorIndex(matches, query.cursor) : 0;
    const window = matches.slice(from, from + query.limit + 1);

    return buildPage({
      records: window,
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.bookedAt.toISOString(), id: record.id }),
    });
  }

  override async findSince(since: Date): Promise<JournalEntryRecord[]> {
    return this.all()
      .filter((record) => record.bookedAt >= since)
      .sort(ascending);
  }

  /** Ids are monotonic ULIDs from one generator, so insertion order *is* id order. */
  override async scanFrom(options: EntryScanOptions): Promise<JournalEntryRecord[]> {
    const start = options.afterId ? this.insertionOrder.indexOf(options.afterId) + 1 : 0;
    return this.insertionOrder
      .slice(start, start + options.limit)
      .map((id) => this.records.get(id) as JournalEntryRecord);
  }

  /** Same conditional write as the Mongo store: a second reversal matches nothing. */
  override async markReversed(input: MarkReversedInput): Promise<void> {
    const record = this.records.get(input.entryId);
    if (!record || record.reversedByEntryId !== null) {
      throw new AppError({
        code: ErrorCode.TRANSACTION_NOT_REVERSIBLE,
        message: `Entry ${input.entryId} was already reversed by a concurrent operation.`,
        context: { entryId: input.entryId },
      });
    }

    this.records.set(input.entryId, {
      ...record,
      status: JournalEntryStatus.REVERSED,
      reversedByEntryId: input.reversedByEntryId,
    });
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.records.clear();
    this.insertionOrder = [];
  }

  private all(): JournalEntryRecord[] {
    return [...this.records.values()];
  }

  /** First index strictly after the cursor anchor, in an already-sorted window. */
  private cursorIndex(sorted: JournalEntryRecord[], cursor: string): number {
    const anchor = decodeCursor(cursor);
    if (!anchor) return 0;

    const index = sorted.findIndex((record) => record.id === anchor.id);
    return index === -1 ? 0 : index + 1;
  }
}

function descending(a: JournalEntryRecord, b: JournalEntryRecord): number {
  const byTime = b.bookedAt.getTime() - a.bookedAt.getTime();
  return byTime === 0 ? b.id.localeCompare(a.id) : byTime;
}

function ascending(a: JournalEntryRecord, b: JournalEntryRecord): number {
  const byTime = a.bookedAt.getTime() - b.bookedAt.getTime();
  return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
}

/** Mirrors the driver's duplicate-key shape closely enough for `instanceof`-free narrowing. */
function duplicateReference(reference: string): Error & { code: number; keyPattern: object } {
  return Object.assign(new Error(`E11000 duplicate key error: reference "${reference}"`), {
    code: DUPLICATE_KEY_CODE,
    keyPattern: { reference: 1 },
  });
}

const DUPLICATE_KEY_CODE = 11_000;
