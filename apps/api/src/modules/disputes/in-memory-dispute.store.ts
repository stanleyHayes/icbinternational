import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import {
  type DisputeListQuery,
  type DisputeRecord,
  type DisputeTransition,
  DisputeStore,
  type NewDispute,
} from './dispute.store.js';

/**
 * In-memory {@link DisputeStore} for service tests.
 *
 * Enforces the same rule the unique Mongo index does — one dispute per transaction —
 * so a test that passes against this fake is testing behaviour, not leniency.
 */
export class InMemoryDisputeStore extends DisputeStore {
  private readonly records = new Map<string, DisputeRecord>();
  private readonly ids = new IdGenerator();

  async insert(row: NewDispute): Promise<DisputeRecord> {
    if (await this.findByTransactionId(row.transactionId)) {
      throw new Error(`Duplicate dispute for transaction ${row.transactionId}`);
    }
    const record: DisputeRecord = { ...row, id: this.ids.generate('dispute') };
    this.records.set(record.id, record);
    return record;
  }

  async findByPublicId(id: string): Promise<DisputeRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByTransactionId(transactionId: string): Promise<DisputeRecord | null> {
    for (const record of this.records.values()) {
      if (record.transactionId === transactionId) return record;
    }
    return null;
  }

  /** Newest first, matching the repository's customer feed. */
  async listForUser(query: DisputeListQuery): Promise<PageResult<DisputeRecord>> {
    return this.page(query, -1);
  }

  /** Oldest first, matching the repository's operations queue. */
  async listForAdmin(query: DisputeListQuery): Promise<PageResult<DisputeRecord>> {
    return this.page(query, 1);
  }

  async applyTransition(input: DisputeTransition): Promise<DisputeRecord | null> {
    const existing = this.records.get(input.id);
    if (!existing) return null;

    const updated: DisputeRecord = {
      ...existing,
      ...input.set,
      evidenceIds: [...existing.evidenceIds, ...(input.appendEvidenceIds ?? [])],
      timeline: [...existing.timeline, input.timelineEntry],
    };
    this.records.set(input.id, updated);
    return updated;
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.records.clear();
  }

  private page(query: DisputeListQuery, direction: 1 | -1): Promise<PageResult<DisputeRecord>> {
    let matches = [...this.records.values()].filter(
      (record) =>
        (!query.userId || record.userId === query.userId) &&
        (!query.status || record.status === query.status),
    );

    matches.sort((a, b) =>
      direction === 1
        ? a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
        : b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      const at = new Date(cursor.sortValue).getTime();
      matches = matches.filter((record) => {
        const time = record.createdAt.getTime();
        if (time !== at) return direction === 1 ? time > at : time < at;
        return direction === 1 ? record.id > cursor.id : record.id < cursor.id;
      });
    }

    const page = buildPage({
      records: matches,
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
    return Promise.resolve(page);
  }
}
