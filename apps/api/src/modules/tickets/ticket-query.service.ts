import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { type PageResult } from '../../common/pagination/cursor.js';

import {
  TicketStore,
  type TicketAudience,
  type TicketListQuery,
  type TicketRecord,
} from './ticket.store.js';
import { type ListTicketsQuery } from './tickets.dto.js';

/**
 * Reading tickets, and the one rule every read obeys.
 *
 * A customer sees their own conversations and nothing else, and that is enforced here
 * rather than in a controller: the customer list is scoped in the query itself, so another
 * person's ticket never matches, and the single-ticket read compares the owner before
 * returning. Putting the check at the route would make it a decorator someone can forget;
 * putting it here means every present and future caller inherits it.
 *
 * A ticket that exists but belongs to somebody else answers 404, deliberately
 * indistinguishable from one that does not exist. A 403 would confirm the conversation is
 * real, which is an enumeration oracle over every support case in the bank — and support
 * threads are the densest free-text PII the platform holds.
 *
 * Opening a conversation marks it read for whichever side opened it. Listing does not: a
 * badge that cleared because a ticket scrolled past in an inbox is a badge that has told
 * the customer nothing.
 */
@Injectable()
export class TicketQueryService {
  constructor(private readonly tickets: TicketStore) {}

  /** The customer's own conversations, newest first. */
  async listForCustomer(
    userId: string,
    query: ListTicketsQuery,
  ): Promise<PageResult<TicketRecord>> {
    return this.tickets.listForUser({ userId, ...toStoreQuery(query) });
  }

  /** The support queue: every customer, longest-waiting first. */
  async listForAgent(query: ListTicketsQuery): Promise<PageResult<TicketRecord>> {
    return this.tickets.listForAgent(toStoreQuery(query));
  }

  /** One of the customer's own conversations, marked as read by them. */
  async getForCustomer(userId: string, ticketId: string): Promise<TicketRecord> {
    return this.readAs(await this.requireOwned(userId, ticketId), 'CUSTOMER');
  }

  /** One conversation, from the bank's side. No ownership test — staff work every customer. */
  async getForAgent(ticketId: string): Promise<TicketRecord> {
    const record = await this.tickets.findByPublicId(ticketId);
    if (!record) throw notFound(ticketId);
    return this.readAs(record, 'AGENT');
  }

  /**
   * The record behind a route parameter, proven to belong to the caller.
   *
   * Returned rather than merely asserted so the services that act on a conversation —
   * posting to it, closing it — take the ownership check and the load in one step and
   * cannot end up acting on a record they proved nothing about.
   */
  async requireOwned(userId: string, ticketId: string): Promise<TicketRecord> {
    const record = await this.tickets.findByPublicId(ticketId);
    if (!record || record.userId !== userId) throw notFound(ticketId);
    return record;
  }

  /** Falls back to the unmarked record: a failed read receipt is not a failed read. */
  private async readAs(record: TicketRecord, audience: TicketAudience): Promise<TicketRecord> {
    const marked = await this.tickets.markRead({ id: record.id, audience });
    return marked ?? record;
  }
}

/**
 * Contract query to store query.
 *
 * The keys are omitted rather than passed as `undefined`: `exactOptionalPropertyTypes` is
 * off in this project, so an explicit undefined would type-check and then reach Mongo as
 * `{ status: undefined }`, which matches documents missing the field rather than matching
 * everything.
 */
function toStoreQuery(query: ListTicketsQuery): TicketListQuery {
  return {
    limit: query.limit,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.topic === undefined ? {} : { topic: query.topic }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  };
}

function notFound(ticketId: string): AppError {
  return AppError.notFound('Ticket', ticketId);
}
