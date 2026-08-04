import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import {
  TransferStore,
  type NewTransfer,
  type TransferListQuery,
  type TransferRecord,
  type TransferTransitionInput,
} from './transfer.store.js';

/** Mongo's duplicate-key code, reproduced so the recovery path is genuinely exercised. */
const DUPLICATE_KEY_CODE = 11_000;

/**
 * An honest, in-memory {@link TransferStore}.
 *
 * "Honest" is the load-bearing word. It reproduces the unique index on `quoteId` — raising
 * a real duplicate-key error rather than quietly overwriting — the owner scope on every
 * read, the status-conditional transition, and the keyset ordering. A test that passes here
 * is testing the execution path's behaviour rather than the fake's leniency, which is the
 * only reason it is worth having.
 *
 * Shipped in `src`, as the ledger and accounts lanes ship theirs, so the seed and
 * simulation workstreams have a transfer sink and the fake cannot drift from its
 * abstraction.
 */
@Injectable()
export class InMemoryTransferStore extends TransferStore {
  private readonly byId = new Map<string, TransferRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(transfer: NewTransfer): Promise<TransferRecord> {
    if (await this.findByQuote(transfer.quoteId)) throw duplicateQuote(transfer.quoteId);

    const record: TransferRecord = {
      ...transfer,
      id: this.ids.generate('transfer'),
      railReference: null,
      returnCode: null,
      returnReason: null,
      timeline: transfer.timeline.map((event) => ({ ...event })),
      metadata: { ...transfer.metadata },
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<TransferRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async findByQuote(quoteId: string): Promise<TransferRecord | null> {
    return [...this.byId.values()].find((record) => record.quoteId === quoteId) ?? null;
  }

  override async list(query: TransferListQuery): Promise<PageResult<TransferRecord>> {
    const matching = [...this.byId.values()]
      .filter((record) => matches(record, query))
      .sort(newestFirst)
      .filter((record) => afterCursor(record, query.cursor))
      .slice(0, query.limit + 1);

    return buildPage({
      records: matching,
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }

  /**
   * Read and write with no `await` between them, exactly as `findOneAndUpdate` behaves.
   *
   * This is the whole reason the fake is worth having. An implementation that awaited a
   * lookup and *then* wrote would let two concurrent cancellations both observe a
   * cancellable transfer and both succeed — the interleaving MongoDB's atomic
   * read-modify-write exists to prevent. A fake with that gap would make the
   * exactly-once test pass while the property it asserts was untested.
   */
  override async transition(input: TransferTransitionInput): Promise<TransferRecord | null> {
    const held = this.byId.get(input.id);
    const record = held && held.userId === input.userId ? held : null;
    if (!record || !input.fromStatuses.includes(record.status)) return null;

    const updated: TransferRecord = {
      ...record,
      status: input.status,
      timeline: [...record.timeline, input.event],
      ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }
}

function matches(record: TransferRecord, query: TransferListQuery): boolean {
  if (record.userId !== query.userId) return false;
  if (query.status && record.status !== query.status) return false;
  if (query.rail && record.rail !== query.rail) return false;
  return !query.sourceAccountId || record.sourceAccountId === query.sourceAccountId;
}

function newestFirst(left: TransferRecord, right: TransferRecord): number {
  const byTime = right.createdAt.getTime() - left.createdAt.getTime();
  return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
}

/** Mirrors the repository's keyset bound: strictly older, or same instant and lower id. */
function afterCursor(record: TransferRecord, cursor: string | undefined): boolean {
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (!decoded) return true;

  const boundary = new Date(decoded.sortValue).getTime();
  const at = record.createdAt.getTime();
  return at < boundary || (at === boundary && record.id < decoded.id);
}

/** The error Mongo raises when the unique index on `quoteId` rejects a second insert. */
function duplicateQuote(quoteId: string): Error & { code: number } {
  return Object.assign(
    new Error(`E11000 duplicate key error collection: transfers index: quoteId_1 ${quoteId}`),
    { code: DUPLICATE_KEY_CODE },
  );
}
