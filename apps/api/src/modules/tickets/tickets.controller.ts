import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  postTicketMessageRequestSchema,
  routes,
  type CreateTicketRequest,
  type Paginated,
  type Ticket,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { TicketConversationService } from './ticket-conversation.service.js';
import { TicketOpenService } from './ticket-open.service.js';
import { TicketQueryService } from './ticket-query.service.js';
import { toContractTicket } from './ticket.mapper.js';
import { TicketRepository } from './ticket.repository.js';
import { TICKET_AUDIT_CAPTURE_FIELDS, TICKET_AUDIT_ENTITY } from './tickets.constants.js';
import {
  closeTicketRequestSchema,
  type CloseTicketRequest,
  type ListTicketsQuery,
  type PostTicketMessageRequest,
} from './tickets.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

const TICKET_ROUTE = routes.support.ticket(`:${ID_PARAM}`);

/** Everything this controller writes is audited under the same entity family. */
const AUDIT = { entity: TICKET_AUDIT_ENTITY, captureFields: TICKET_AUDIT_CAPTURE_FIELDS };

/**
 * A customer's conversations with the bank.
 *
 * `CsrfGuard` sits on the mutations only. These routes authenticate from a cookie, which
 * is exactly what a cross-site request can ride on, so every state change carries the
 * double-submit check — but a read cannot be weaponised that way and the client does not
 * send the header on one, so requiring it there would break the inbox rather than protect
 * it.
 *
 * Nothing here is `@Idempotent()`. That decorator makes an `Idempotency-Key` header
 * mandatory and refuses the request without one, and the finished client does not send it
 * on these routes — adding it would turn every working screen into a 400. It is also not
 * what the decorator is for: no route in this file moves money, and a duplicate message is
 * a visible, deletable annoyance rather than a payment made twice.
 *
 * No handler checks ownership. That rule lives in `TicketQueryService`, so it holds for
 * every caller rather than for every caller who remembered.
 */
@Controller()
export class TicketsController {
  constructor(
    private readonly opening: TicketOpenService,
    private readonly queries: TicketQueryService,
    private readonly conversation: TicketConversationService,
  ) {}

  @Get(routes.support.tickets)
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listTicketsQuerySchema)) query: ListTicketsQuery,
  ): Promise<Paginated<Ticket>> {
    const page = await this.queries.listForCustomer(user.userId, query);
    return {
      data: page.data.map((ticket) => toContractTicket(ticket, 'CUSTOMER')),
      page: page.page,
    };
  }

  /** Opens a conversation. The reply time the bank commits to comes back with it. */
  @Post(routes.support.tickets)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'ticket.open', subjectLoader: TicketRepository, ...AUDIT })
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createTicketRequestSchema)) request: CreateTicketRequest,
  ): Promise<Ticket> {
    const ticket = await this.opening.open({ userId: user.userId, request });
    return toContractTicket(ticket, 'CUSTOMER');
  }

  /** One conversation and its whole thread. Reading it clears the customer's unread count. */
  @Get(TICKET_ROUTE)
  @UseGuards(JwtAuthGuard)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) ticketId: string,
  ): Promise<Ticket> {
    return toContractTicket(await this.queries.getForCustomer(user.userId, ticketId), 'CUSTOMER');
  }

  /** Ends a conversation, and records how the bank did if the customer says. */
  @Patch(TICKET_ROUTE)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'ticket.close', subjectLoader: TicketRepository, ...AUDIT })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) ticketId: string,
    @Body(zodBody(closeTicketRequestSchema)) request: CloseTicketRequest,
  ): Promise<Ticket> {
    const ticket = await this.conversation.close({ userId: user.userId, ticketId, request });
    return toContractTicket(ticket, 'CUSTOMER');
  }

  /** Adds to the thread. A settled conversation reopens, as the closing email promised. */
  @Post(routes.support.ticketMessages(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'ticket.message', subjectLoader: TicketRepository, ...AUDIT })
  async postMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) ticketId: string,
    @Body(zodBody(postTicketMessageRequestSchema)) request: PostTicketMessageRequest,
  ): Promise<Ticket> {
    const ticket = await this.conversation.postMessage({ userId: user.userId, ticketId, request });
    return toContractTicket(ticket, 'CUSTOMER');
  }
}
