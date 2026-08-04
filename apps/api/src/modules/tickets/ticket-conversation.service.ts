import { Injectable } from '@nestjs/common';

import { ErrorCode, TicketStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { UsersService } from '../auth/users/index.js';

import { slaDueAtFor, statusAfterCustomerMessage } from './domain/ticket-lifecycle.js';
import { customerDisplayName, ticketMessageId } from './ticket-format.js';
import { TicketQueryService } from './ticket-query.service.js';
import { TicketStore, type TicketChange, type TicketRecord } from './ticket.store.js';
import { type CloseTicketRequest, type PostTicketMessageRequest } from './tickets.dto.js';

/** A customer adding to a conversation they own. */
export interface PostMessageInput {
  readonly userId: string;
  readonly ticketId: string;
  readonly request: PostTicketMessageRequest;
}

/** A customer ending a conversation they own, and optionally rating it. */
export interface CloseTicketInput {
  readonly userId: string;
  readonly ticketId: string;
  readonly request: CloseTicketRequest;
}

/**
 * What a customer does to a conversation that already exists.
 *
 * Writing to a settled conversation reopens it. That is not leniency — the resolution
 * email tells the customer in as many words that replying reopens the case with the same
 * reference and the same person, and an API that answered `PRECONDITION_FAILED` instead
 * would make the bank a liar in writing.
 *
 * Every write here goes through `requireOwned` first, so the ownership rule is applied to
 * the record being changed rather than to a route parameter that was checked separately.
 */
@Injectable()
export class TicketConversationService {
  constructor(
    private readonly tickets: TicketStore,
    private readonly queries: TicketQueryService,
    private readonly users: UsersService,
    private readonly clock: ClockService,
  ) {}

  /** Adds the customer's message to their own thread and puts the move back on the bank. */
  async postMessage(input: PostMessageInput): Promise<TicketRecord> {
    const current = await this.queries.requireOwned(input.userId, input.ticketId);
    const author = await this.users.requireById(input.userId);
    const now = this.clock.now();
    const status = statusAfterCustomerMessage(current.status);

    return this.write({
      id: current.id,
      set: {
        status,
        slaDueAt: slaDueAtFor({ status, priority: current.priority, now }),
        resolvedAt: null,
        // Somebody writing in a thread has read it. Moving the position past the message
        // being appended means a customer who replies is not left with an unread badge
        // over their own answer.
        customerReadUpTo: current.messages.length + 1,
      },
      appendMessage: {
        id: ticketMessageId(current.messages.length + 1),
        authorType: 'CUSTOMER',
        authorName: customerDisplayName(author),
        body: input.request.body,
        attachmentIds: [...input.request.attachmentIds],
        sentAt: now,
      },
    });
  }

  /**
   * Ends a conversation at the customer's request.
   *
   * Closing an already-closed conversation is a no-op rather than an error: the only way a
   * customer produces one is by tapping the button twice, and answering the second tap
   * with a failure tells them something went wrong when nothing did.
   */
  async close(input: CloseTicketInput): Promise<TicketRecord> {
    const current = await this.queries.requireOwned(input.userId, input.ticketId);
    const rating = this.ratingFor(current, input.request);

    if (current.status === TicketStatus.CLOSED && rating === undefined) return current;

    const now = this.clock.now();
    return this.write({
      id: current.id,
      set: {
        status: TicketStatus.CLOSED,
        slaDueAt: null,
        resolvedAt: current.resolvedAt ?? now,
        customerReadUpTo: current.messages.length,
        ...(rating === undefined ? {} : { satisfactionRating: rating }),
      },
    });
  }

  /**
   * The rating being recorded, or `undefined` when none is.
   *
   * A rating may be given once. Allowing a second would let a customer's opinion be
   * revised after the fact, and an average built from revisable numbers is not a
   * measurement of anything.
   */
  private ratingFor(current: TicketRecord, request: CloseTicketRequest): number | undefined {
    if (request.satisfactionRating === undefined) return undefined;
    if (current.satisfactionRating !== null) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'This conversation has already been rated. The rating we hold stands.',
      );
    }
    return request.satisfactionRating;
  }

  /** Applies the change, translating a vanished ticket into the answer a caller expects. */
  private async write(change: TicketChange): Promise<TicketRecord> {
    const updated = await this.tickets.applyChange(change);
    if (!updated) throw AppError.notFound('Ticket', change.id);
    return updated;
  }
}
