import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { TransferOrderStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { NEWEST_FIRST, TRANSFER_ORDER_MODEL } from './transfer-order.constants.js';
import {
  type TransferOrderDocument,
  type TransferOrderSchemaClass,
} from './transfer-order.schema.js';
import {
  TransferOrderStore,
  type NewTransferOrder,
  type TransferOrderListQuery,
  type TransferOrderPatch,
  type TransferOrderRecord,
} from './transfer-order.store.js';

type Filter = QueryFilter<TransferOrderSchemaClass>;

/**
 * MongoDB-backed standing-order persistence.
 *
 * {@link patch} carries the module's one concurrency guarantee. Filtering on
 * `expectedStatuses` means a cancellation and a skip that race resolve in the database:
 * whichever lands first sets the status, and the other matches nothing and returns null.
 * A read-then-write in the service would let a skip revive the schedule of an order the
 * customer had just stopped.
 *
 * Also the module's {@link AuditSubjectLoader}, so the trail diffs the same document the
 * store reads rather than a projection of it.
 */
@Injectable()
export class TransferOrderRepository
  extends BaseRepository<TransferOrderSchemaClass>
  implements TransferOrderStore, AuditSubjectLoader
{
  constructor(
    @InjectModel(TRANSFER_ORDER_MODEL) model: Model<TransferOrderSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(order: NewTransferOrder, session?: ClientSession): Promise<TransferOrderRecord> {
    const created = await this.create(
      {
        ...order,
        id: this.ids.generate('transferOrder'),
        status: TransferOrderStatus.ACTIVE,
        occurrencesRun: 0,
        lastRunAt: null,
        consecutiveFailures: 0,
      },
      session,
    );

    return toRecord(created as TransferOrderDocument);
  }

  async findOwnedById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<TransferOrderRecord | null> {
    const found = await this.findOne({ id, userId } as Filter, session);
    return found ? toRecord(found as TransferOrderDocument) : null;
  }

  async list(query: TransferOrderListQuery): Promise<PageResult<TransferOrderRecord>> {
    const found = await this.find(listFilter(query), {
      sort: { createdAt: NEWEST_FIRST, id: NEWEST_FIRST },
      // One over the page, so a next page can be proved without a count.
      limit: query.limit + 1,
    });

    return buildPage({
      records: found.map((document) => toRecord(document as TransferOrderDocument)),
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }

  async patch(input: TransferOrderPatch): Promise<TransferOrderRecord | null> {
    const updated = await this.updateOne(
      {
        id: input.id,
        userId: input.userId,
        status: { $in: [...input.expectedStatuses] },
      } as Filter,
      { $set: input.fields },
      input.session,
    );

    return updated ? toRecord(updated as TransferOrderDocument) : null;
  }

  async dueForRun(at: Date, limit: number): Promise<readonly TransferOrderRecord[]> {
    const found = await this.find(
      { status: TransferOrderStatus.ACTIVE, nextRunAt: { $ne: null, $lte: at } } as Filter,
      { sort: { nextRunAt: 1 }, limit },
    );

    return found.map((document) => toRecord(document as TransferOrderDocument));
  }

  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findOne({ id: entityId } as Filter);
    return found ? (found.toObject() as unknown as Record<string, unknown>) : null;
  }
}

/**
 * Filter assembly. The cursor anchors on `(createdAt, id)` rather than `createdAt` alone,
 * because a customer who sets up three standing orders in one sitting has three rows that
 * share a second, and a cursor that cannot tell them apart drops one.
 */
function listFilter(query: TransferOrderListQuery): Filter {
  const filter: Filter = { userId: query.userId };
  if (query.status) filter.status = query.status;
  if (query.sourceAccountId) filter.sourceAccountId = query.sourceAccountId;

  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    const at = new Date(cursor.sortValue);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, id: { $lt: cursor.id } }];
  }

  return filter;
}

function toRecord(document: TransferOrderDocument): TransferOrderRecord {
  return document.toObject<TransferOrderSchemaClass>();
}
