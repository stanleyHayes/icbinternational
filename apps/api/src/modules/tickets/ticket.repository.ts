import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter, type UpdateQuery } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { toTicketRecord } from './ticket.mapper.js';
import { type TicketSchemaClass } from './ticket.schema.js';
import {
  type MarkReadInput,
  type NewTicket,
  type TicketChange,
  type TicketListQuery,
  type TicketRecord,
  TicketStore,
} from './ticket.store.js';
import { TICKET_MODEL } from './tickets.constants.js';

type Filter = QueryFilter<TicketSchemaClass>;

/** Which stored position a read receipt lands on. */
const READ_FIELD = { CUSTOMER: 'customerReadUpTo', AGENT: 'agentReadUpTo' } as const;

/**
 * MongoDB-backed ticket persistence — the production binding of {@link TicketStore}.
 *
 * Also the module's {@link AuditSubjectLoader}: the audit interceptor resolves this
 * repository from the container and asks it for the before/after snapshot, so the trail
 * diffs exactly what the store would read.
 */
@Injectable()
export class TicketRepository
  extends BaseRepository<TicketSchemaClass>
  implements TicketStore, AuditSubjectLoader
{
  constructor(
    @InjectModel(TICKET_MODEL) model: Model<TicketSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /** Writes the conversation, minting its public `tkt_` id at the last responsible moment. */
  async insert(row: NewTicket): Promise<TicketRecord> {
    const created = await this.create({ ...row, id: this.ids.generate('ticket') });
    return toTicketRecord(created);
  }

  async findByPublicId(id: string): Promise<TicketRecord | null> {
    const found = await this.findOne({ id } as Filter);
    return found ? toTicketRecord(found) : null;
  }

  /** Newest first — a customer reads their conversations like an inbox. */
  async listForUser(query: TicketListQuery): Promise<PageResult<TicketRecord>> {
    const found = await this.find(this.buildFilter(query, -1), {
      sort: { createdAt: -1, id: -1 },
      limit: query.limit + 1,
    });
    return this.page(found, query.limit);
  }

  /** Oldest first — the queue is a work list, and a work list is worked front to back. */
  async listForAgent(query: TicketListQuery): Promise<PageResult<TicketRecord>> {
    const found = await this.find(this.buildFilter(query, 1), {
      sort: { createdAt: 1, id: 1 },
      limit: query.limit + 1,
    });
    return this.page(found, query.limit);
  }

  async applyChange(change: TicketChange): Promise<TicketRecord | null> {
    const update: UpdateQuery<TicketSchemaClass> = { $set: change.set };
    if (change.appendMessage) update.$push = { messages: change.appendMessage };

    const updated = await this.updateOne({ id: change.id } as Filter, update);
    return updated ? toTicketRecord(updated) : null;
  }

  /**
   * Records a read, without touching `updatedAt`.
   *
   * Two things here need the driver rather than the base repository, which is why this
   * method exists separately. `timestamps: false`, because looking at a conversation is
   * not a change to it and a customer opening their own ticket must not push it back to
   * the top of anybody's list as though something had happened. And a pipeline update, so
   * the new position is `$size` of the thread *as the database sees it at write time* —
   * a count carried from an earlier read would silently mark a message that arrived in
   * between as already seen.
   */
  async markRead(input: MarkReadInput): Promise<TicketRecord | null> {
    const updated = await this.collection
      .findOneAndUpdate({ id: input.id } as Filter, [
        { $set: { [READ_FIELD[input.audience]]: { $size: '$messages' } } },
      ])
      .setOptions({ new: true, timestamps: false })
      .exec();

    return updated ? toTicketRecord(updated) : null;
  }

  /** The audit interceptor's snapshot, minus nothing — the capture list filters it. */
  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findOne({ id: entityId } as Filter);
    return found ? (found.toObject() as unknown as Record<string, unknown>) : null;
  }

  /**
   * Filter assembly.
   *
   * The cursor anchors on `(createdAt, id)` rather than on `updatedAt`, even though the
   * customer's inbox is described to them in terms of when a conversation last moved. A
   * cursor pinned to a value that changes is a cursor rows walk across: a ticket updated
   * while somebody is paging past it either appears twice or never appears at all, which
   * is the exact failure cursors exist to prevent.
   */
  private buildFilter(query: TicketListQuery, direction: 1 | -1): Filter {
    const filter: Filter = {};
    if (query.userId) filter.userId = query.userId;
    if (query.status) filter.status = query.status;
    if (query.topic) filter.topic = query.topic;

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
    found: Awaited<ReturnType<BaseRepository<TicketSchemaClass>['find']>>,
    limit: number,
  ): PageResult<TicketRecord> {
    const page = buildPage({
      records: found,
      limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
    return { data: page.data.map(toTicketRecord), page: page.page };
  }
}
