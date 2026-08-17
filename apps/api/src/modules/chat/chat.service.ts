import { Injectable } from '@nestjs/common';

import {
  ChatConversationStatus,
  ErrorCode,
  type CreateChatConversationRequest,
  type CreateGuestChatRequest,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { type PageResult } from '../../common/pagination/cursor.js';
import { UsersService } from '../auth/users/index.js';

import { ChatStreamService } from './chat-stream.service.js';
import { toConversationSummary, toWireMessage } from './chat.mapper.js';
import {
  ChatStore,
  type ChatConversationRecord,
  type ChatListQuery,
  type ChatMessageRecord,
} from './chat.store.js';

/** Entity name in "not found" messages, spelled once. */
const CONVERSATION_ENTITY = 'Chat conversation';

/**
 * The participant side of live chat: guests from the public site, and signed-in
 * customers.
 *
 * Two rules live here rather than in a controller, so every present and future caller
 * inherits them.
 *
 * **Ownership is enforced on the record, not the route.** A customer conversation that
 * belongs to somebody else answers 404, deliberately indistinguishable from one that
 * does not exist — a 403 would confirm the conversation is real, which is an
 * enumeration oracle over every support chat in the bank. Guest routes need no such
 * check: the guest's token names the one conversation it may touch, and the guard has
 * already refused anything else.
 *
 * **A closed conversation stays closed.** Unlike a ticket, a chat is a live session:
 * reopening it silently would leave a customer typing into a thread no agent is
 * watching. Posting to one is a conflict, stated plainly.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly conversations: ChatStore,
    private readonly users: UsersService,
    private readonly stream: ChatStreamService,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  // --- Guest (public site) --------------------------------------------------

  /**
   * Starts a conversation from the marketing site.
   *
   * The guest's first words are the opening message; no synthetic welcome is prepended,
   * because the site already shows one client-side and storing a second copy would only
   * ever drift from it.
   */
  async createGuestConversation(request: CreateGuestChatRequest): Promise<ChatConversationRecord> {
    const now = this.clock.now();

    const record = await this.conversations.insert({
      status: ChatConversationStatus.OPEN,
      subject: `Website chat with ${request.name}`,
      customerUserId: null,
      guest: { name: request.name, email: request.email },
      assignedAgentName: null,
      messages: [this.message('GUEST', request.name, request.body, now)],
      unreadCount: 0,
      agentUnreadCount: 1,
      lastMessageAt: now,
      closedAt: null,
    });

    this.publish(record);
    return record;
  }

  /** The guest's own thread. Opening it clears their unread badge. */
  async getGuestConversation(conversationId: string): Promise<ChatConversationRecord> {
    const record = await this.require(conversationId);
    return (
      (await this.conversations.markRead({ id: record.id, audience: 'PARTICIPANT' })) ?? record
    );
  }

  /** The guest adds to their thread. */
  async postGuestMessage(conversationId: string, body: string): Promise<ChatConversationRecord> {
    const current = await this.require(conversationId);
    this.assertOpen(current);

    const now = this.clock.now();
    const updated = await this.conversations.applyChange({
      id: current.id,
      set: { agentUnreadCount: current.agentUnreadCount + 1, lastMessageAt: now },
      appendMessage: this.message('GUEST', current.guest?.name ?? 'Guest', body, now),
    });
    if (!updated) throw AppError.notFound(CONVERSATION_ENTITY, conversationId);

    this.publish(updated);
    return updated;
  }

  // --- Customer (signed in) ---------------------------------------------------

  /** The customer's own conversations, most recently active first. */
  async listConversations(
    userId: string,
    query: ChatListQuery,
  ): Promise<PageResult<ChatConversationRecord>> {
    return this.conversations.listForUser({ ...query, userId });
  }

  /** Opens a conversation, signed with the name the bank knows the customer by. */
  async createConversation(
    userId: string,
    request: CreateChatConversationRequest,
  ): Promise<ChatConversationRecord> {
    const author = await this.users.requireById(userId);
    const now = this.clock.now();

    const record = await this.conversations.insert({
      status: ChatConversationStatus.OPEN,
      subject: request.subject,
      customerUserId: userId,
      guest: null,
      assignedAgentName: null,
      messages: [this.message('CUSTOMER', displayNameOf(author), request.body, now)],
      unreadCount: 0,
      agentUnreadCount: 1,
      lastMessageAt: now,
      closedAt: null,
    });

    this.publish(record);
    return record;
  }

  /** One of the customer's own conversations, marked as read by them. */
  async getConversation(userId: string, conversationId: string): Promise<ChatConversationRecord> {
    const record = await this.requireOwned(userId, conversationId);
    return (
      (await this.conversations.markRead({ id: record.id, audience: 'PARTICIPANT' })) ?? record
    );
  }

  /** The customer adds to their own thread. */
  async postMessage(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<ChatConversationRecord> {
    const current = await this.requireOwned(userId, conversationId);
    this.assertOpen(current);

    const author = await this.users.requireById(userId);
    const now = this.clock.now();
    const updated = await this.conversations.applyChange({
      id: current.id,
      set: { agentUnreadCount: current.agentUnreadCount + 1, lastMessageAt: now },
      appendMessage: this.message('CUSTOMER', displayNameOf(author), body, now),
    });
    if (!updated) throw AppError.notFound(CONVERSATION_ENTITY, conversationId);

    this.publish(updated);
    return updated;
  }

  /**
   * Ends the conversation at the customer's request.
   *
   * Closing an already-closed conversation is a no-op rather than an error: the only
   * way a customer produces one is by tapping the button twice, and answering the
   * second tap with a failure tells them something went wrong when nothing did.
   */
  async closeConversation(userId: string, conversationId: string): Promise<ChatConversationRecord> {
    const current = await this.requireOwned(userId, conversationId);
    if (current.status === ChatConversationStatus.CLOSED) return current;

    const now = this.clock.now();
    const updated = await this.conversations.applyChange({
      id: current.id,
      set: { status: ChatConversationStatus.CLOSED, closedAt: now },
    });
    if (!updated) throw AppError.notFound(CONVERSATION_ENTITY, conversationId);

    this.stream.publishConversation(updated, toConversationSummary(updated));
    return updated;
  }

  /**
   * The record behind a route parameter, proven to belong to the caller.
   *
   * Returned rather than merely asserted so the writes above take the ownership check
   * and the load in one step and cannot act on a record they proved nothing about.
   */
  private async requireOwned(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationRecord> {
    const record = await this.conversations.findByPublicId(conversationId);
    if (!record || record.customerUserId !== userId) {
      throw AppError.notFound(CONVERSATION_ENTITY, conversationId);
    }
    return record;
  }

  private async require(conversationId: string): Promise<ChatConversationRecord> {
    const record = await this.conversations.findByPublicId(conversationId);
    if (!record) throw AppError.notFound(CONVERSATION_ENTITY, conversationId);
    return record;
  }

  private assertOpen(record: ChatConversationRecord): void {
    if (record.status === ChatConversationStatus.CLOSED) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'This conversation has been closed. Start a new one and the team will pick it up.',
      );
    }
  }

  private message(
    authorType: ChatMessageRecord['authorType'],
    authorName: string,
    body: string,
    sentAt: Date,
  ): ChatMessageRecord {
    return { id: this.ids.generate('chatMessage'), authorType, authorName, body, sentAt };
  }

  /** Tells every live listener: the new message, and the inbox row it moved. */
  private publish(record: ChatConversationRecord): void {
    const latest = record.messages.at(-1);
    if (latest) this.stream.publishMessage(record, toWireMessage(latest));
    this.stream.publishConversation(record, toConversationSummary(record));
  }
}

/** The name a participant's messages are signed with. */
function displayNameOf(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
