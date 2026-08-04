import { Injectable } from '@nestjs/common';

import { type TicketStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { isSettled, slaDueAtFor, statusAfterAgentReply } from './domain/ticket-lifecycle.js';
import { TicketNotifier } from './ports/ticket-notifier.port.js';
import { excerptOf, ticketMessageId } from './ticket-format.js';
import { TicketQueryService } from './ticket-query.service.js';
import {
  TicketStore,
  type TicketChange,
  type TicketMessageRecord,
  type TicketPatch,
  type TicketRecord,
} from './ticket.store.js';
import { type AgentTicketUpdateRequest } from './tickets.dto.js';

/** An agent acting on a conversation. Only the name reaches the customer. */
export interface AgentTicketUpdateInput {
  readonly ticketId: string;
  readonly agentName: string;
  readonly request: AgentTicketUpdateRequest;
}

/**
 * What an agent does to a conversation.
 *
 * Reply, reassign, reprioritise and resolve arrive as one patch and are applied as one
 * write, because the console sends them together and because half of them landing is
 * worse than none: a ticket marked resolved without the reply that resolved it is a
 * customer told the case is closed and never told why.
 *
 * Exactly one notification leaves per action, even when the action does several things.
 * An agent who answers and closes in one go has performed one act of service, and sending
 * two emails for it trains the customer to stop opening either — so a resolution carries
 * the reply as its explanation rather than being announced separately.
 */
@Injectable()
export class TicketAgentService {
  constructor(
    private readonly tickets: TicketStore,
    private readonly queries: TicketQueryService,
    private readonly notifier: TicketNotifier,
    private readonly clock: ClockService,
  ) {}

  async update(input: AgentTicketUpdateInput): Promise<TicketRecord> {
    const current = await this.queries.getForAgent(input.ticketId);
    const change = buildChange(current, input, this.clock.now());

    const updated = await this.tickets.applyChange(change);
    if (!updated) throw AppError.notFound('Ticket', input.ticketId);

    await this.announce(current, updated, change.appendMessage ?? null);
    return updated;
  }

  /**
   * Tells the customer the one thing this action was.
   *
   * A conversation that has just been settled is announced as settled and carries the
   * agent's words as the reason. A conversation that only moved on is announced as a
   * reply. A conversation that changed hands or changed priority is announced as nothing:
   * the customer did not ask who inside the bank is holding their case, and an email
   * saying it has been reassigned reads as an email saying nobody has looked at it.
   */
  private async announce(
    before: TicketRecord,
    after: TicketRecord,
    reply: TicketMessageRecord | null,
  ): Promise<void> {
    if (isSettled(after.status) && !isSettled(before.status)) {
      await this.notifier.ticketResolved({
        userId: after.userId,
        reference: after.id,
        outcome: reply ? excerptOf(reply.body) : CLOSED_WITHOUT_A_REPLY,
      });
      return;
    }

    if (!reply) return;

    await this.notifier.ticketReplied({
      userId: after.userId,
      reference: after.id,
      agentName: reply.authorName,
      excerpt: excerptOf(reply.body),
    });
  }
}

/** Said when a case is closed with no accompanying words, so the email is never blank. */
const CLOSED_WITHOUT_A_REPLY =
  'We have finished looking into this and closed your case. Everything we said about it is in the conversation.';

/**
 * The whole patch, assembled before anything is written.
 *
 * Built as one value rather than applied field by field so the reply, the state it puts
 * the conversation in and the deadline that state implies are decided together — three
 * sequential writes would leave two intermediate states an agent never asked for, and the
 * SLA board reads whichever one it happens to poll.
 */
function buildChange(
  current: TicketRecord,
  input: AgentTicketUpdateInput,
  now: Date,
): TicketChange {
  const reply = buildReply(current, input, now);
  const status = nextStatus(current, input.request, reply !== null);
  const priority = input.request.priority ?? current.priority;

  const set: TicketPatch = {
    status,
    priority,
    slaDueAt: slaDueAtFor({ status, priority, now }),
    resolvedAt: isSettled(status) ? (current.resolvedAt ?? now) : null,
    // An agent who wrote in the thread has read it; one who only reassigned may not have.
    ...(reply ? { agentReadUpTo: current.messages.length + 1 } : {}),
    ...assignment(input.request),
  };

  return reply ? { id: current.id, set, appendMessage: reply } : { id: current.id, set };
}

function buildReply(
  current: TicketRecord,
  input: AgentTicketUpdateInput,
  now: Date,
): TicketMessageRecord | null {
  if (input.request.reply === undefined) return null;

  return {
    id: ticketMessageId(current.messages.length + 1),
    authorType: 'AGENT',
    authorName: input.agentName,
    body: input.request.reply,
    attachmentIds: [...input.request.attachmentIds],
    sentAt: now,
  };
}

/**
 * Where the conversation lands.
 *
 * An explicit status wins, because an agent who chose one from the dropdown meant it. A
 * reply with no chosen status hands the conversation back to the customer. Anything else
 * leaves it where it was.
 */
function nextStatus(
  current: TicketRecord,
  request: AgentTicketUpdateRequest,
  replied: boolean,
): TicketStatus {
  if (request.status !== undefined) return request.status;
  return replied ? statusAfterAgentReply(current.status) : current.status;
}

/** An empty name is the console's way of giving a ticket back to the queue. */
function assignment(request: AgentTicketUpdateRequest): TicketPatch {
  if (request.assignedAgentName === undefined) return {};
  return { assignedAgentName: request.assignedAgentName || null };
}
