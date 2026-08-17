import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter, type UpdateQuery } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { CHAT_MODEL } from './chat.constants.js';
import { toChatRecord } from './chat.mapper.js';
import { type ChatConversationSchemaClass } from './chat.schema.js';
import {
  type ChatChange,
  type ChatConversationRecord,
  type ChatListQuery,
  type ChatMarkReadInput,
  ChatStore,
  type NewChatConversation,
} from './chat.store.js';

type Filter = QueryFilter<ChatConversationSchemaClass>;

/** Which stored counter a read receipt zeroes. */
const READ_FIELD = { PARTICIPANT: 'unreadCount', AGENT: 'agentUnreadCount' } as const;

/**
 * MongoDB-backed chat persistence — the production binding of {@link ChatStore}.
 *
 * Also the module's {@link AuditSubjectLoader}: the audit interceptor resolves this
 * repository from the container and asks it for the before/after snapshot, so the trail
 * diffs exactly what the store would read.
 */
@Injectable()
export class ChatRepository
  extends BaseRepository<ChatConversationSchemaClass>
  implements ChatStore, AuditSubjectLoader
{
  constructor(
    @InjectModel(CHAT_MODEL) model: Model<ChatConversationSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /** Writes the conversation, minting its public `cnv_` id at the last responsible moment. */
  async insert(row: NewChatConversation): Promise<ChatConversationRecord> {
    const created = await this.create({ ...row, id: this.ids.generate('chatConversation') });
    return toChatRecord(created);
  }

  async findByPublicId(id: string): Promise<ChatConversationRecord | null> {
    const found = await this.findOne({ id } as Filter);
    return found ? toChatRecord(found) : null;
  }

  /** A customer's own conversations, most recently active first. */
  async listForUser(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>> {
    const found = await this.find(this.buildFilter(query), {
      sort: { lastMessageAt: -1, id: -1 },
      limit: query.limit + 1,
    });
    return this.page(found, query.limit);
  }

  /** The agent inbox: every conversation, most recently active first. */
  async listForInbox(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>> {
    return this.listForUser(query);
  }

  async applyChange(change: ChatChange): Promise<ChatConversationRecord | null> {
    const update: UpdateQuery<ChatConversationSchemaClass> = { $set: change.set };
    if (change.appendMessage) update.$push = { messages: change.appendMessage };

    const updated = await this.updateOne({ id: change.id } as Filter, update);
    return updated ? toChatRecord(updated) : null;
  }

  /**
   * Zeroes a side's unread counter, without touching `updatedAt`.
   *
   * `timestamps: false`, because looking at a conversation is not a change to it and an
   * agent opening a thread must not push it back to the top of the inbox as though
   * something had happened.
   */
  async markRead(input: ChatMarkReadInput): Promise<ChatConversationRecord | null> {
    const updated = await this.collection
      .findOneAndUpdate({ id: input.id } as Filter, {
        $set: { [READ_FIELD[input.audience]]: 0 },
      })
      .setOptions({ new: true, timestamps: false })
      .exec();

    return updated ? toChatRecord(updated) : null;
  }

  /** The audit interceptor's snapshot, minus nothing — the capture list filters it. */
  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findOne({ id: entityId } as Filter);
    return found ? (found.toObject() as unknown as Record<string, unknown>) : null;
  }

  /**
   * Filter assembly.
   *
   * The cursor anchors on `(lastMessageAt, id)` rather than on `createdAt`, even though
   * a value that changes on every message is exactly what the tickets lane warns a
   * cursor against. Chat accepts the trade deliberately: the inbox's defining order is
   * "most recently spoken-to first", and a cursor pinned to creation time would page
   * the inbox in an order nobody works in. A conversation that moves while somebody is
   * paging may repeat on the next page — visible, harmless, and self-correcting on the
   * live stream the inbox also listens to.
   */
  private buildFilter(query: ChatListQuery): Filter {
    const filter: Filter = {};
    if (query.userId) filter.customerUserId = query.userId;
    if (query.status) filter.status = query.status;

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      const at = new Date(cursor.sortValue);
      filter.$or = [{ lastMessageAt: { $lt: at } }, { lastMessageAt: at, id: { $lt: cursor.id } }];
    }
    return filter;
  }

  private page(
    found: Awaited<ReturnType<BaseRepository<ChatConversationSchemaClass>['find']>>,
    limit: number,
  ): PageResult<ChatConversationRecord> {
    const page = buildPage({
      records: found,
      limit,
      toCursor: (record) => ({ sortValue: record.lastMessageAt.toISOString(), id: record.id }),
    });
    return { data: page.data.map(toChatRecord), page: page.page };
  }
}
