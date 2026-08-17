import { Injectable } from '@nestjs/common';

import { ChatConversationStatus, ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { type PageResult } from '../../common/pagination/cursor.js';
import { type AdminPrincipal } from '../rbac/index.js';

import { ChatStreamService } from './chat-stream.service.js';
import { toConversationSummary, toWireMessage } from './chat.mapper.js';
import {
  ChatStore,
  type ChatConversationRecord,
  type ChatListQuery,
  type ChatMessageRecord,
} from './chat.store.js';

/** The closing line, signed by the bank rather than by the agent who clicked. */
const SYSTEM_AUTHOR_NAME = 'Reliance Bank';
const CLOSED_MESSAGE_BODY =
  'This conversation has been closed. If you need anything else, start a new chat and the team will pick it up.';

/**
 * The agent side of live chat: the support inbox.
 *
 * No ownership test anywhere here — staff work every conversation, as they do every
 * ticket. The two rules that do live here:
 *
 * **A reply is signed with the agent's session name**, taken from the principal rather
 * than the request body. A console that let a message be signed with a name the
 * sender chose would make the attribution on every message in the bank worth nothing.
 *
 * **A closed conversation stays closed** for agents too. A reply into a closed thread
 * would reach a customer who was told the conversation ended, from a queue that no
 * longer lists it.
 */
@Injectable()
export class AdminChatService {
  constructor(
    private readonly conversations: ChatStore,
    private readonly stream: ChatStreamService,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  /** The inbox: every conversation, most recently active first, filterable by status. */
  async listConversations(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>> {
    return this.conversations.listForInbox(query);
  }

  /** One conversation and its whole thread. Opening it clears the agent-side badge. */
  async getConversation(conversationId: string): Promise<ChatConversationRecord> {
    const record = await this.require(conversationId);
    return (await this.conversations.markRead({ id: record.id, audience: 'AGENT' })) ?? record;
  }

  /**
   * Replies to the customer or guest.
   *
   * The first agent to write takes the conversation: `assignedAgentName` is set once
   * and left alone afterwards, so the name the participant was shown does not change
   * hands mid-thread without anyone deciding it should.
   */
  async postAgentMessage(
    agent: AdminPrincipal,
    conversationId: string,
    body: string,
  ): Promise<ChatConversationRecord> {
    const current = await this.require(conversationId);
    if (current.status === ChatConversationStatus.CLOSED) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'This conversation has been closed and cannot be replied to.',
      );
    }

    const now = this.clock.now();
    const updated = await this.conversations.applyChange({
      id: current.id,
      set: {
        unreadCount: current.unreadCount + 1,
        lastMessageAt: now,
        ...(current.assignedAgentName === null ? { assignedAgentName: agent.fullName } : {}),
      },
      appendMessage: this.message('AGENT', agent.fullName, body, now),
    });
    if (!updated) throw AppError.notFound('Chat conversation', conversationId);

    this.publish(updated);
    return updated;
  }

  /**
   * Ends the conversation from the bank's side, with a closing line on the record.
   *
   * The closing message is signed SYSTEM rather than with the agent's name: the words
   * are the bank's standing sentence, not something the agent wrote, and attributing
   * them to a person would misrepresent both.
   *
   * Closing an already-closed conversation is a no-op: the second click is the double
   * tap it always is, and answering it with a failure — or a second closing line —
   * tells the agent something went wrong when nothing did.
   */
  async closeConversation(conversationId: string): Promise<ChatConversationRecord> {
    const current = await this.require(conversationId);
    if (current.status === ChatConversationStatus.CLOSED) return current;

    const now = this.clock.now();
    const updated = await this.conversations.applyChange({
      id: current.id,
      set: { status: ChatConversationStatus.CLOSED, closedAt: now, lastMessageAt: now },
      appendMessage: this.message('SYSTEM', SYSTEM_AUTHOR_NAME, CLOSED_MESSAGE_BODY, now),
    });
    if (!updated) throw AppError.notFound('Chat conversation', conversationId);

    this.publish(updated);
    return updated;
  }

  private async require(conversationId: string): Promise<ChatConversationRecord> {
    const record = await this.conversations.findByPublicId(conversationId);
    if (!record) throw AppError.notFound('Chat conversation', conversationId);
    return record;
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
