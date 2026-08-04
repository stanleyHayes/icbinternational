/**
 * The support queue, for staff.
 *
 * Permissioned on `ticket:manage`. The queue is ordered longest-waiting first rather than
 * by identifier: a work list sorted by id is a work list nobody works in the right order,
 * and every conversation here carries a reply time the bank has already promised in
 * writing.
 *
 * The patch is `@Audited()` and that is load-bearing. A reply is the bank's words to a
 * customer, and the first question asked when a complaint escalates is who said them —
 * a console that could answer a customer anonymously would be a console no complaint can
 * be investigated through. It is not `@Idempotent()`: that decorator requires an
 * `Idempotency-Key` header the finished console does not send, and a replayed patch here
 * appends a duplicate message rather than moving money twice.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';

import {
  listTicketsQuerySchema,
  Permission,
  routes,
  type Paginated,
  type Ticket,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { AdminEndpoint, CurrentAdmin, type AdminPrincipal } from '../rbac/index.js';

import { TicketAgentService } from './ticket-agent.service.js';
import { TicketQueryService } from './ticket-query.service.js';
import { toContractTicket } from './ticket.mapper.js';
import { TicketRepository } from './ticket.repository.js';
import { TICKET_AUDIT_CAPTURE_FIELDS, TICKET_AUDIT_ENTITY } from './tickets.constants.js';
import {
  agentTicketUpdateRequestSchema,
  type AgentTicketUpdateRequest,
  type ListTicketsQuery,
} from './tickets.dto.js';

const ID_PARAM = 'id';

const TICKET_ROUTE = routes.admin.ticket(`:${ID_PARAM}`);

@Controller()
@AdminEndpoint(Permission.TICKET_MANAGE)
export class AdminTicketsController {
  constructor(
    private readonly queries: TicketQueryService,
    private readonly agents: TicketAgentService,
  ) {}

  /** Every customer's conversations, longest-waiting first. */
  @Get(routes.admin.tickets)
  async queue(
    @Query(zodBody(listTicketsQuerySchema)) query: ListTicketsQuery,
  ): Promise<Paginated<Ticket>> {
    const page = await this.queries.listForAgent(query);
    return { data: page.data.map((ticket) => toContractTicket(ticket, 'AGENT')), page: page.page };
  }

  /** One conversation. Opening it clears the queue's unread count for this side. */
  @Get(TICKET_ROUTE)
  async get(@Param(ID_PARAM) ticketId: string): Promise<Ticket> {
    return toContractTicket(await this.queries.getForAgent(ticketId), 'AGENT');
  }

  /**
   * Replies, reassigns, reprioritises or resolves — in any combination, as one act.
   *
   * The agent's name comes from their session rather than from the body. A console that
   * let a reply be signed with a name the sender chose would make the attribution on every
   * message in the bank worth nothing.
   */
  @Patch(TICKET_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Audited({
    action: 'ticket.update',
    entity: TICKET_AUDIT_ENTITY,
    subjectLoader: TicketRepository,
    captureFields: TICKET_AUDIT_CAPTURE_FIELDS,
  })
  async update(
    @CurrentAdmin() agent: AdminPrincipal | undefined,
    @Param(ID_PARAM) ticketId: string,
    @Body(zodBody(agentTicketUpdateRequestSchema)) request: AgentTicketUpdateRequest,
  ): Promise<Ticket> {
    if (!agent) throw AppError.forbidden('This action needs a signed-in operator.');

    const ticket = await this.agents.update({ ticketId, agentName: agent.fullName, request });
    return toContractTicket(ticket, 'AGENT');
  }
}
