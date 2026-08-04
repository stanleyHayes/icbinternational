import { Injectable } from '@nestjs/common';

import { MandateStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { RETAINED_COLLECTIONS } from './mandate.constants.js';
import {
  MandateStore,
  type MandateListQuery,
  type MandateRecord,
  type MandateTransition,
  type NewMandate,
  type RecordCollectionInput,
  type RecordRefundInput,
} from './mandate.store.js';

/**
 * An honest, in-memory {@link MandateStore}.
 *
 * {@link recordCollection} refuses anything that is not `ACTIVE`, and {@link recordRefund}
 * refuses a collection that has already been refunded — both read and write with no `await`
 * between them, as the atomic updates they stand in for do. Those two conditions are the
 * module's guarantees: cancelling blocks the next collection, and the guarantee refunds
 * once. A lenient fake would leave both untested.
 */
@Injectable()
export class InMemoryMandateStore extends MandateStore {
  private readonly byId = new Map<string, MandateRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(mandate: NewMandate): Promise<MandateRecord> {
    const record: MandateRecord = {
      ...mandate,
      id: this.ids.generate('transferOrder'),
      status: MandateStatus.ACTIVE,
      lastCollectedAt: null,
      lastAmount: null,
      collections: [],
      cancelledAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<MandateRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async findByIdUnscoped(id: string): Promise<MandateRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: MandateListQuery): Promise<readonly MandateRecord[]> {
    return [...this.byId.values()]
      .filter((record) => matches(record, query))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, query.limit);
  }

  override async transition(input: MandateTransition): Promise<MandateRecord | null> {
    const held = this.byId.get(input.id);
    const record = held && held.userId === input.userId ? held : null;
    if (!record || !input.fromStatuses.includes(record.status)) return null;

    const updated: MandateRecord = {
      ...record,
      status: input.status,
      ...(input.cancelledAt === undefined ? {} : { cancelledAt: input.cancelledAt }),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }

  override async recordCollection(input: RecordCollectionInput): Promise<MandateRecord | null> {
    const record = this.byId.get(input.mandateId);
    if (!record || record.status !== MandateStatus.ACTIVE) return null;

    const updated: MandateRecord = {
      ...record,
      lastCollectedAt: input.collection.collectedAt,
      lastAmount: input.collection.amount,
      nextExpectedAt: input.nextExpectedAt,
      collections: [...record.collections, input.collection].slice(-RETAINED_COLLECTIONS),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }

  override async recordRefund(input: RecordRefundInput): Promise<MandateRecord | null> {
    const record = this.byId.get(input.mandateId);
    const target = record?.collections.find(
      (entry) => entry.journalEntryId === input.journalEntryId && entry.refundedAt === null,
    );
    if (!record || !target) return null;

    const updated: MandateRecord = {
      ...record,
      collections: record.collections.map((entry) =>
        entry === target
          ? {
              ...entry,
              refundedAt: input.refundedAt,
              refundEntryId: input.refundEntryId,
              refundReason: input.refundReason,
            }
          : entry,
      ),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }

  override async dueForCollection(at: Date, limit: number): Promise<readonly MandateRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === MandateStatus.ACTIVE &&
          record.nextExpectedAt !== null &&
          record.nextExpectedAt.getTime() <= at.getTime(),
      )
      .sort(
        (left, right) =>
          (left.nextExpectedAt?.getTime() ?? 0) - (right.nextExpectedAt?.getTime() ?? 0),
      )
      .slice(0, limit);
  }
}

function matches(record: MandateRecord, query: MandateListQuery): boolean {
  if (record.userId !== query.userId) return false;
  if (query.status && record.status !== query.status) return false;
  return !query.accountId || record.accountId === query.accountId;
}
