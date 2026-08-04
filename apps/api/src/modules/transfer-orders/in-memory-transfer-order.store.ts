import { Injectable } from '@nestjs/common';

import { TransferOrderStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import {
  TransferOrderStore,
  type NewTransferOrder,
  type TransferOrderListQuery,
  type TransferOrderPatch,
  type TransferOrderRecord,
} from './transfer-order.store.js';

/**
 * An honest, in-memory {@link TransferOrderStore}.
 *
 * {@link patch} refuses a status the caller did not expect, exactly as the conditional
 * update it stands in for does. That refusal is the module's guarantee — a skip cannot
 * revive a cancelled order — so a lenient fake would leave the one thing worth testing
 * untested.
 */
@Injectable()
export class InMemoryTransferOrderStore extends TransferOrderStore {
  private readonly byId = new Map<string, TransferOrderRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(order: NewTransferOrder): Promise<TransferOrderRecord> {
    const record: TransferOrderRecord = {
      ...order,
      id: this.ids.generate('transferOrder'),
      status: TransferOrderStatus.ACTIVE,
      occurrencesRun: 0,
      lastRunAt: null,
      consecutiveFailures: 0,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findOwnedById(id: string, userId: string): Promise<TransferOrderRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async list(query: TransferOrderListQuery): Promise<PageResult<TransferOrderRecord>> {
    const anchor = query.cursor ? decodeCursor(query.cursor) : null;

    const records = [...this.byId.values()]
      .filter((record) => matches(record, query))
      .filter((record) => anchor === null || record.createdAt.toISOString() < anchor.sortValue)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, query.limit + 1);

    return buildPage({
      records,
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }

  override async patch(input: TransferOrderPatch): Promise<TransferOrderRecord | null> {
    const held = this.byId.get(input.id);
    const record = held && held.userId === input.userId ? held : null;
    if (!record || !input.expectedStatuses.includes(record.status)) return null;

    const updated: TransferOrderRecord = { ...record, ...input.fields };
    this.byId.set(updated.id, updated);
    return updated;
  }

  override async dueForRun(at: Date, limit: number): Promise<readonly TransferOrderRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === TransferOrderStatus.ACTIVE &&
          record.nextRunAt !== null &&
          record.nextRunAt.getTime() <= at.getTime(),
      )
      .sort((left, right) => (left.nextRunAt?.getTime() ?? 0) - (right.nextRunAt?.getTime() ?? 0))
      .slice(0, limit);
  }
}

function matches(record: TransferOrderRecord, query: TransferOrderListQuery): boolean {
  if (record.userId !== query.userId) return false;
  if (query.status && record.status !== query.status) return false;
  return !query.sourceAccountId || record.sourceAccountId === query.sourceAccountId;
}
