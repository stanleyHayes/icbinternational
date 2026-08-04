import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import {
  type MarkReadInput,
  type NewTicket,
  type TicketChange,
  type TicketListQuery,
  type TicketRecord,
  TicketStore,
} from './ticket.store.js';

/**
 * An honest, in-memory `TicketStore`.
 *
 * The rules that matter are reproduced exactly rather than approximated. {@link markRead}
 * moves the read position to the length of the thread and leaves `updatedAt` alone, so a
 * test can prove that reading a conversation does not resurface it; {@link applyChange}
 * applies the patch and the appended message together,
 * so a test cannot pass against a fake that would let a reply land without the state it
 * produced. A twin that got either wrong would make the interesting tests green while the
 * production path stayed broken.
 *
 * Shipped in `src`, as the holds and disputes lanes do, so the module stands up in a test
 * that has no replica set — and so the fake lives beside the abstraction it doubles and
 * cannot drift away from it unnoticed.
 */
@Injectable()
export class InMemoryTicketStore extends TicketStore {
  private readonly byId = new Map<string, TicketRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(row: NewTicket): Promise<TicketRecord> {
    const now = row.messages.at(0)?.sentAt ?? new Date(0);
    const record: TicketRecord = {
      ...row,
      id: this.ids.generate('ticket'),
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findByPublicId(id: string): Promise<TicketRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async listForUser(query: TicketListQuery): Promise<PageResult<TicketRecord>> {
    return this.page(query, -1);
  }

  override async listForAgent(query: TicketListQuery): Promise<PageResult<TicketRecord>> {
    return this.page(query, 1);
  }

  override async applyChange(change: TicketChange): Promise<TicketRecord | null> {
    const current = this.byId.get(change.id);
    if (!current) return null;

    const messages = change.appendMessage
      ? [...current.messages, change.appendMessage]
      : current.messages;

    const updated: TicketRecord = {
      ...current,
      ...change.set,
      messages,
      updatedAt: change.appendMessage?.sentAt ?? current.updatedAt,
    };
    this.byId.set(updated.id, updated);
    return updated;
  }

  override async markRead(input: MarkReadInput): Promise<TicketRecord | null> {
    const current = this.byId.get(input.id);
    if (!current) return null;

    const field = input.audience === 'CUSTOMER' ? 'customerReadUpTo' : 'agentReadUpTo';
    const updated: TicketRecord = { ...current, [field]: current.messages.length };
    this.byId.set(updated.id, updated);
    return updated;
  }

  private page(query: TicketListQuery, direction: 1 | -1): PageResult<TicketRecord> {
    const matching = [...this.byId.values()]
      .filter((ticket) => matches(ticket, query))
      .sort((left, right) => direction * (left.createdAt.getTime() - right.createdAt.getTime()));

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const from = cursor ? matching.findIndex((ticket) => ticket.id === cursor.id) + 1 : 0;

    return buildPage({
      records: matching.slice(from),
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }
}

function matches(ticket: TicketRecord, query: TicketListQuery): boolean {
  if (query.userId && ticket.userId !== query.userId) return false;
  if (query.status && ticket.status !== query.status) return false;
  if (query.topic && ticket.topic !== query.topic) return false;
  return true;
}
