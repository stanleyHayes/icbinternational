import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import {
  type ChatChange,
  type ChatConversationRecord,
  type ChatListQuery,
  type ChatMarkReadInput,
  ChatStore,
  type NewChatConversation,
} from './chat.store.js';

/**
 * An honest, in-memory `ChatStore`.
 *
 * The rules that matter are reproduced exactly rather than approximated:
 * {@link applyChange} applies the patch and the appended message together, so a test
 * cannot pass against a fake that would let a message land without the state it
 * produced, and {@link markRead} zeroes a counter without touching `updatedAt`, so a
 * test can prove that reading a conversation does not resurface it. A twin that got
 * either wrong would make the interesting tests green while the production path stayed
 * broken.
 *
 * Shipped in `src`, as the tickets lane does, so the module stands up in a test that
 * has no replica set — and so the fake lives beside the abstraction it doubles and
 * cannot drift away from it unnoticed.
 */
@Injectable()
export class InMemoryChatStore extends ChatStore {
  private readonly byId = new Map<string, ChatConversationRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(row: NewChatConversation): Promise<ChatConversationRecord> {
    const now = row.messages.at(0)?.sentAt ?? row.lastMessageAt;
    const record: ChatConversationRecord = {
      ...row,
      id: this.ids.generate('chatConversation'),
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findByPublicId(id: string): Promise<ChatConversationRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async listForUser(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>> {
    return this.page(query);
  }

  override async listForInbox(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>> {
    return this.page(query);
  }

  override async applyChange(change: ChatChange): Promise<ChatConversationRecord | null> {
    const current = this.byId.get(change.id);
    if (!current) return null;

    const messages = change.appendMessage
      ? [...current.messages, change.appendMessage]
      : current.messages;

    const updated: ChatConversationRecord = {
      ...current,
      ...change.set,
      messages,
      updatedAt: change.appendMessage?.sentAt ?? current.updatedAt,
    };
    this.byId.set(updated.id, updated);
    return updated;
  }

  override async markRead(input: ChatMarkReadInput): Promise<ChatConversationRecord | null> {
    const current = this.byId.get(input.id);
    if (!current) return null;

    const field = input.audience === 'PARTICIPANT' ? 'unreadCount' : 'agentUnreadCount';
    const updated: ChatConversationRecord = { ...current, [field]: 0 };
    this.byId.set(updated.id, updated);
    return updated;
  }

  /** Both lists order by last activity, newest first — an inbox, not an archive. */
  private page(query: ChatListQuery): PageResult<ChatConversationRecord> {
    const matching = [...this.byId.values()]
      .filter((conversation) => matches(conversation, query))
      .sort(
        (left, right) =>
          right.lastMessageAt.getTime() - left.lastMessageAt.getTime() ||
          right.id.localeCompare(left.id),
      );

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const from = cursor
      ? matching.findIndex((conversation) => conversation.id === cursor.id) + 1
      : 0;

    return buildPage({
      records: matching.slice(from),
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.lastMessageAt.toISOString(), id: record.id }),
    });
  }
}

function matches(conversation: ChatConversationRecord, query: ChatListQuery): boolean {
  if (query.userId && conversation.customerUserId !== query.userId) return false;
  if (query.status && conversation.status !== query.status) return false;
  return true;
}
