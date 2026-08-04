import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { ErrorCode, JournalEntryStatus } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  buildPage,
  decodeCursor,
  type CursorPayload,
  type PageResult,
} from '../../../common/pagination/cursor.js';
import { BaseRepository } from '../../../database/base.repository.js';
import { JOURNAL_ENTRY_MODEL } from '../ledger.constants.js';
import {
  type JournalEntryDocument,
  type JournalEntrySchemaClass,
} from '../schemas/journal-entry.schema.js';

import { toJournalEntryRecord } from './journal-entry.mapper.js';
import {
  type AccountEntryQuery,
  type EntryScanOptions,
  type JournalEntryRecord,
  type JournalEntryStore,
  type MarkReversedInput,
  type NewJournalEntry,
} from './journal-entry.store.js';

/**
 * MongoDB-backed journal-entry persistence — the production binding of
 * {@link JournalEntryStore}.
 *
 * Every method honours the session it is given, for the reason `BaseRepository`
 * documents: a read inside a money transaction that forgets the session reads outside the
 * snapshot, and a ledger that decides on a balance which no longer exists is not a ledger.
 *
 * Reads return plain records rather than hydrated documents. Handing a service something
 * with `save()` on it hands it a way to write to the system of record from outside a
 * transaction, and the whole design here is that there is exactly one writer.
 */
@Injectable()
export class JournalEntryRepository
  extends BaseRepository<JournalEntrySchemaClass>
  implements JournalEntryStore
{
  constructor(
    @InjectModel(JOURNAL_ENTRY_MODEL) model: Model<JournalEntrySchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /** Writes the entry, minting its public `jnl_` id at the last responsible moment. */
  async insert(entry: NewJournalEntry, session?: ClientSession): Promise<JournalEntryRecord> {
    const created = await this.create(
      { ...entry, id: this.ids.generate('journalEntry'), reversedByEntryId: null },
      session,
    );
    return toJournalEntryRecord(created);
  }

  async findByReference(
    reference: string,
    session?: ClientSession,
  ): Promise<JournalEntryRecord | null> {
    return this.readOne({ reference } as QueryFilter<JournalEntrySchemaClass>, session);
  }

  async findByPublicId(id: string, session?: ClientSession): Promise<JournalEntryRecord | null> {
    return this.readOne({ id } as QueryFilter<JournalEntrySchemaClass>, session);
  }

  /**
   * Newest-first page for one account, anchored by an opaque cursor.
   *
   * Sorted by `bookedAt` descending with the ULID id as tie-breaker — the same total order
   * the compound index serves — so a page boundary cannot skip or repeat a row even when
   * two entries share a millisecond, which back-dated batch postings produce by the dozen.
   */
  async findByAccount(query: AccountEntryQuery): Promise<PageResult<JournalEntryRecord>> {
    const documents = await this.find(accountFilter(query), {
      sort: { bookedAt: -1, id: -1 },
      // One more than asked for: the extra row proves there is a next page without a
      // second count query against a collection that only ever grows.
      limit: query.limit + 1,
      ...(query.session ? { session: query.session } : {}),
    });

    return buildPage({
      records: documents.map((document) => toJournalEntryRecord(document)),
      limit: query.limit,
      toCursor: toCursorPayload,
    });
  }

  async findSince(since: Date, session?: ClientSession): Promise<JournalEntryRecord[]> {
    const documents = await this.find(
      { bookedAt: { $gte: since } } as QueryFilter<JournalEntrySchemaClass>,
      { sort: { bookedAt: 1, id: 1 }, ...(session ? { session } : {}) },
    );
    return documents.map((document) => toJournalEntryRecord(document));
  }

  /**
   * Keyset scan in id order, for a full replay.
   *
   * ULIDs sort lexicographically by creation time, so `id > afterId` walks the collection
   * in booking order — and unlike a skip/limit it cannot miss or double-count an entry
   * that is inserted while the verifier is part-way through.
   */
  async scanFrom(options: EntryScanOptions): Promise<JournalEntryRecord[]> {
    const filter = (
      options.afterId ? { id: { $gt: options.afterId } } : {}
    ) as QueryFilter<JournalEntrySchemaClass>;

    const documents = await this.find(filter, {
      sort: { id: 1 },
      limit: options.limit,
      ...(options.session ? { session: options.session } : {}),
    });
    return documents.map((document) => toJournalEntryRecord(document));
  }

  /**
   * The only mutation this repository permits: link an original to its reversal.
   *
   * The filter demands `reversedByEntryId: null`, making this a compare-and-set. A second
   * reversal racing the first matches nothing and is rejected loudly, rather than
   * overwriting the winner's link and leaving two reversals pointing at one entry.
   */
  async markReversed(input: MarkReversedInput): Promise<void> {
    const updated = await this.updateOne(
      { id: input.entryId, reversedByEntryId: null } as QueryFilter<JournalEntrySchemaClass>,
      {
        $set: {
          status: JournalEntryStatus.REVERSED,
          reversedByEntryId: input.reversedByEntryId,
        },
      },
      input.session,
    );

    if (!updated) {
      throw new AppError({
        code: ErrorCode.TRANSACTION_NOT_REVERSIBLE,
        message: `Entry ${input.entryId} was already reversed by a concurrent operation.`,
        context: { entryId: input.entryId },
      });
    }
  }

  private async readOne(
    filter: QueryFilter<JournalEntrySchemaClass>,
    session?: ClientSession,
  ): Promise<JournalEntryRecord | null> {
    const document: JournalEntryDocument | null = await this.findOne(filter, session);
    return document ? toJournalEntryRecord(document) : null;
  }
}

/**
 * Newest-first page boundary over `(bookedAt, id)`.
 *
 * A cursor on `bookedAt` alone would drop or repeat rows sharing a timestamp. The `$or`
 * expresses "strictly older, or the same instant but a lower id" — a total order, so the
 * boundary is exact. An unreadable cursor is rejected rather than ignored: silently
 * serving page one when the client asked for page four is worse than an error.
 */
function accountFilter(query: AccountEntryQuery): QueryFilter<JournalEntrySchemaClass> {
  const base = { 'postings.accountId': query.accountId };
  if (!query.cursor) return base as QueryFilter<JournalEntrySchemaClass>;

  const anchor = decodeCursor(query.cursor);
  if (!anchor) {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'The pagination cursor is not one this API issued.',
    });
  }

  const bookedAt = new Date(anchor.sortValue);
  return {
    ...base,
    $or: [{ bookedAt: { $lt: bookedAt } }, { bookedAt, id: { $lt: anchor.id } }],
  } as QueryFilter<JournalEntrySchemaClass>;
}

function toCursorPayload(record: JournalEntryRecord): CursorPayload {
  return { sortValue: record.bookedAt.toISOString(), id: record.id };
}
