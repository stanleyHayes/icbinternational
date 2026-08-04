import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, type UpdateQuery } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { toDisputeRecord } from './dispute.mapper.js';
import { type DisputeSchemaClass } from './dispute.schema.js';
import {
  type DisputeListQuery,
  type DisputeRecord,
  type DisputeTransition,
  DisputeStore,
  type NewDispute,
} from './dispute.store.js';
import { DISPUTE_MODEL } from './disputes.constants.js';

type Filter = QueryFilter<DisputeSchemaClass>;

/**
 * MongoDB-backed dispute persistence — the production binding of {@link DisputeStore}.
 *
 * Also the module's {@link AuditSubjectLoader}: the audit interceptor resolves this
 * repository from the container and asks it for the before/after snapshot, so the
 * trail diffs exactly what the store would read.
 */
@Injectable()
export class DisputeRepository
  extends BaseRepository<DisputeSchemaClass>
  implements DisputeStore, AuditSubjectLoader
{
  constructor(
    @InjectModel(DISPUTE_MODEL) model: Model<DisputeSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /** Writes the case, minting its public `dsp_` id at the last responsible moment. */
  async insert(row: NewDispute, session?: ClientSession): Promise<DisputeRecord> {
    const created = await this.create({ ...row, id: this.ids.generate('dispute') }, session);
    return toDisputeRecord(created);
  }

  async findByPublicId(id: string, session?: ClientSession): Promise<DisputeRecord | null> {
    const found = await this.findOne({ id } as Filter, session);
    return found ? toDisputeRecord(found) : null;
  }

  async findByTransactionId(
    transactionId: string,
    session?: ClientSession,
  ): Promise<DisputeRecord | null> {
    const found = await this.findOne({ transactionId } as Filter, session);
    return found ? toDisputeRecord(found) : null;
  }

  /** Newest first — a customer reads their disputes like a feed. */
  async listForUser(query: DisputeListQuery): Promise<PageResult<DisputeRecord>> {
    const filter = this.buildFilter(query, -1);
    const found = await this.find(filter, {
      sort: { createdAt: -1, id: -1 },
      limit: query.limit + 1,
    });
    return this.page(found, query.limit);
  }

  /** Oldest first — the operations queue is a work list, and a work list is worked front to back. */
  async listForAdmin(query: DisputeListQuery): Promise<PageResult<DisputeRecord>> {
    const filter = this.buildFilter(query, 1);
    const found = await this.find(filter, {
      sort: { createdAt: 1, id: 1 },
      limit: query.limit + 1,
    });
    return this.page(found, query.limit);
  }

  /** The one write a case undergoes after creation: a transition plus its history step. */
  async applyTransition(
    input: DisputeTransition,
    session?: ClientSession,
  ): Promise<DisputeRecord | null> {
    const update: UpdateQuery<DisputeSchemaClass> = {
      $set: input.set,
      $push: { timeline: input.timelineEntry },
    };
    if (input.appendEvidenceIds && input.appendEvidenceIds.length > 0) {
      (update.$push as unknown as Record<string, unknown>).evidenceIds = {
        $each: [...input.appendEvidenceIds],
      };
    }

    const updated = await this.updateOne({ id: input.id } as Filter, update, session);
    return updated ? toDisputeRecord(updated) : null;
  }

  /** The audit interceptor's snapshot, minus nothing — the capture list filters it. */
  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findOne({ id: entityId } as Filter);
    return found ? (found.toObject() as unknown as Record<string, unknown>) : null;
  }

  /**
   * Filter assembly. The cursor is an anchor on `(createdAt, id)`: past it, in whichever
   * direction the list runs, never an offset that shifts underfoot.
   */
  private buildFilter(query: DisputeListQuery, direction: 1 | -1): Filter {
    const filter: Filter = {};
    if (query.userId) filter.userId = query.userId;
    if (query.status) filter.status = query.status;

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      const at = new Date(cursor.sortValue);
      const comparison = direction === 1 ? '$gt' : '$lt';
      filter.$or = [
        { createdAt: { [comparison]: at } },
        { createdAt: at, id: { [comparison]: cursor.id } },
      ];
    }
    return filter;
  }

  private page(
    found: Awaited<ReturnType<BaseRepository<DisputeSchemaClass>['find']>>,
    limit: number,
  ): PageResult<DisputeRecord> {
    const page = buildPage({
      records: found,
      limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
    return { data: page.data.map(toDisputeRecord), page: page.page };
  }
}
