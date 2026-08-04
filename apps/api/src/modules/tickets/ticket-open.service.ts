import { Injectable } from '@nestjs/common';

import { TicketStatus, type CreateTicketRequest } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { UsersService } from '../auth/users/index.js';

import { priorityForTopic, slaDueAtFor } from './domain/ticket-lifecycle.js';
import { TicketNotifier } from './ports/ticket-notifier.port.js';
import { customerDisplayName, formatRespondBy, ticketMessageId } from './ticket-format.js';
import { TicketStore, type NewTicket, type TicketRecord } from './ticket.store.js';

/** A customer starting a conversation. */
export interface OpenTicketInput {
  readonly userId: string;
  readonly request: CreateTicketRequest;
}

/**
 * Opening a support conversation.
 *
 * The customer is not asked how urgent it is or who should handle it. The topic they
 * picked in order to be routed sets the priority, and the priority sets the reply time the
 * bank then commits to in writing — which is the part that matters, because an
 * acknowledgement that names a deadline is one the bank can be held to and one the agent
 * console scores itself against.
 *
 * The opening message is the thread's first entry rather than a separate `body` field on
 * the ticket. A conversation that stored its first message differently from its
 * subsequent ones would need every reader to special-case the first, and the first is the
 * one that gets quoted back in a complaint.
 *
 * The notification is sent after the write and cannot roll it back. A customer whose
 * message was recorded has been heard; telling them the send failed, when a mail provider
 * is having a bad afternoon, would only make them send it again.
 */
@Injectable()
export class TicketOpenService {
  constructor(
    private readonly tickets: TicketStore,
    private readonly users: UsersService,
    private readonly notifier: TicketNotifier,
    private readonly clock: ClockService,
  ) {}

  async open(input: OpenTicketInput): Promise<TicketRecord> {
    const author = await this.users.requireById(input.userId);
    const ticket = await this.tickets.insert(
      newTicket(input, customerDisplayName(author), this.clock.now()),
    );

    await this.notifier.ticketReceived({
      userId: ticket.userId,
      reference: ticket.id,
      subjectLine: ticket.subject,
      respondBy: formatRespondBy(ticket.slaDueAt ?? this.clock.now()),
    });

    return ticket;
  }
}

/**
 * The conversation as it is first written.
 *
 * The customer's read position starts at the one message that exists: they have,
 * self-evidently, read their own words, and a conversation that arrived already showing
 * them one unread item would be a badge that never meant anything. The agent's stays at
 * zero, so the queue shows the message as waiting until somebody actually opens it.
 *
 * The message is numbered by its position rather than given an identifier of its own —
 * see `ticketMessageId` for why the contract asks for exactly that.
 */
function newTicket(input: OpenTicketInput, authorName: string, now: Date): NewTicket {
  const { request } = input;
  const priority = priorityForTopic(request.topic);
  const status = TicketStatus.OPEN;

  return {
    userId: input.userId,
    subject: request.subject,
    topic: request.topic,
    status,
    priority,
    assignedAgentName: null,
    relatedTransactionId: request.relatedTransactionId ?? null,
    messages: [
      {
        id: ticketMessageId(1),
        authorType: 'CUSTOMER',
        authorName,
        body: request.body,
        attachmentIds: [...request.attachmentIds],
        sentAt: now,
      },
    ],
    customerReadUpTo: 1,
    agentReadUpTo: 0,
    slaDueAt: slaDueAtFor({ status, priority, now }),
    satisfactionRating: null,
    resolvedAt: null,
  };
}
