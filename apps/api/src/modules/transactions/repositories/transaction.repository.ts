import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  buildPage,
  type CursorPayload,
  type PageResult,
} from '../../../common/pagination/cursor.js';
import { BaseRepository } from '../../../database/base.repository.js';
import { type TransactionSchemaClass } from '../schemas/transaction.schema.js';
import { TRANSACTION_MODEL } from '../transactions.constants.js';

import { buildListFilter, buildRangeFilter } from './transaction-filter.js';
import { toTransactionRecord } from './transaction.mapper.js';
import {
  type AdminTransactionQuery,
  type EntryAccountQuery,
  type LatestBeforeQuery,
  type NewTransaction,
  type TransactionListQuery,
  type TransactionPatch,
  type TransactionRangeQuery,
  type TransactionRecord,
  TransactionStore,
} from './transaction.store.js';

type Filter = QueryFilter<TransactionSchemaClass>;

/**
 * MongoDB-backed transaction persistence — the production binding of
 * {@link TransactionStore}.
 *
 * Every method honours the session it is given. A projection written outside the posting
 * transaction can survive a rollback of the entry it projects, which would leave a
 * customer looking at a payment the ledger says never happened.
 */
@Injectable()
export class TransactionRepository
  extends BaseRepository<TransactionSchemaClass>
  implements TransactionStore
{
  constructor(
    @InjectModel(TRANSACTION_MODEL) model: Model<TransactionSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /** Writes the row, minting its public `txn_` id at the last responsible moment. */
  async insert(row: NewTransaction, session?: ClientSession): Promise<TransactionRecord> {
    const created = await this.create(
      {
        ...row,
        id: this.ids.generate('transaction'),
        categoryOverridden: false,
        notes: null,
        attachmentIds: [],
        disputeId: null,
      },
      session,
    );
    return toTransactionRecord(created);
  }

  async findByEntryAndAccount(query: EntryAccountQuery): Promise<TransactionRecord | null> {
    return this.readOne(
      { journalEntryId: query.journalEntryId, accountId: query.accountId } as Filter,
      query.session,
    );
  }

  async findByPublicId(id: string, session?: ClientSession): Promise<TransactionRecord | null> {
    return this.readOne({ id } as Filter, session);
  }

  /**
   * Newest-first page under the full filter set, anchored by an opaque cursor.
   *
   * Sorted by `bookedAt` descending with the ULID id as tie-breaker — the same total
   * order the compound indexes serve — so the page boundary is stable even while rows are
   * being inserted, which for a transaction feed is continuously.
   */
  async list(query: TransactionListQuery): Promise<PageResult<TransactionRecord>> {
    const documents = await this.find(buildListFilter(query), {
      sort: { bookedAt: -1, id: -1 },
      // One more than asked for: the extra row proves there is a next page without a
      // second count query against a collection that only ever grows.
      limit: query.limit + 1,
    });

    return buildPage({
      records: documents.map((document) => toTransactionRecord(document)),
      limit: query.limit,
      toCursor: newestFirstCursor,
    });
  }

  async listAdmin(query: AdminTransactionQuery): Promise<PageResult<TransactionRecord>> {
    const filter: Filter = query.cursor ? ({ id: { $lt: query.cursor } } as Filter) : ({} as Filter);
    const documents = await this.find(filter, {
      sort: { bookedAt: -1, id: -1 },
      limit: query.limit + 1,
    });
    return buildPage({
      records: documents.map((document) => toTransactionRecord(document)),
      limit: query.limit,
      toCursor: newestFirstCursor,
    });
  }

  /**
   * Applies a customer edit, scoped to the owner in the filter itself.
   *
   * Ownership is part of the `where` clause rather than a check performed beforehand, so
   * a row belonging to someone else simply matches nothing. A read-then-write would have
   * a window in which the two disagree; this has none.
   */
  async patch(input: TransactionPatch): Promise<TransactionRecord | null> {
    const fields = patchFields(input);
    // Mongo rejects an empty `$set`. An empty patch is a no-op edit, not an error, so it
    // reads the row back instead — the caller still learns whether it exists and is theirs.
    if (Object.keys(fields).length === 0) {
      return this.readOne({ id: input.id, userId: input.userId } as Filter, input.session);
    }

    const updated = await this.updateOne(
      { id: input.id, userId: input.userId } as Filter,
      { $set: fields },
      input.session,
    );
    return updated ? toTransactionRecord(updated) : null;
  }

  async scanRange(query: TransactionRangeQuery): Promise<TransactionRecord[]> {
    const documents = await this.find(buildRangeFilter(query), {
      sort: { id: 1 },
      limit: query.limit,
    });
    return documents.map((document) => toTransactionRecord(document));
  }

  async latestBefore(query: LatestBeforeQuery): Promise<TransactionRecord | null> {
    const [document] = await this.find(
      {
        userId: query.userId,
        accountId: query.accountId,
        bookedAt: { $lt: query.before },
      } as Filter,
      // Same total order as the feed, so "the latest row" means the same thing here as it
      // does on the statement the customer is comparing against.
      { sort: { bookedAt: -1, id: -1 }, limit: 1 },
    );

    return document ? toTransactionRecord(document) : null;
  }

  private async readOne(
    filter: Filter,
    session?: ClientSession,
  ): Promise<TransactionRecord | null> {
    const document = await this.findOne(filter, session);
    return document ? toTransactionRecord(document) : null;
  }
}

/**
 * Only the fields present in the patch are written.
 *
 * `notes: null` is a deliberate clear and must reach the `$set`, so the test is on
 * `undefined` rather than on falsiness. Setting `categoryOverridden` alongside a category
 * change is what makes the override sticky: the projector consults it and never
 * re-derives a category the customer has corrected.
 */
function patchFields(input: TransactionPatch): Record<string, unknown> {
  return {
    ...(input.category === undefined ? {} : { category: input.category, categoryOverridden: true }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

function newestFirstCursor(record: TransactionRecord): CursorPayload {
  return { sortValue: record.bookedAt.toISOString(), id: record.id };
}
