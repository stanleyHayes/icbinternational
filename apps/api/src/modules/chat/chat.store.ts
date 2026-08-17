import { type ChatAuthorType, type ChatConversationStatus } from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about chat persistence.
 *
 * An abstract class rather than an interface because Nest resolves it as both an
 * injection token and a type. Services never see a Mongoose document — only these plain
 * records — so no handler can rewrite a thread outside the store's targeted writes.
 *
 * No method takes a `ClientSession`, and that is a statement rather than an omission: a
 * conversation is one document, nothing here posts to the ledger, and every change is a
 * single atomic update.
 */
export abstract class ChatStore {
  abstract insert(row: NewChatConversation): Promise<ChatConversationRecord>;

  abstract findByPublicId(id: string): Promise<ChatConversationRecord | null>;

  /** One customer's own conversations, most recently active first. */
  abstract listForUser(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>>;

  /** The agent inbox: every conversation, most recently active first. */
  abstract listForInbox(query: ChatListQuery): Promise<PageResult<ChatConversationRecord>>;

  /**
   * Applies a patch and, when the change carries one, appends a message in the same
   * write.
   *
   * Returns the updated record, or `null` when the conversation no longer exists. The
   * append rides the same update so a message can never land without the state it
   * produced, or the state without the message that explains it.
   */
  abstract applyChange(change: ChatChange): Promise<ChatConversationRecord | null>;

  /**
   * Zeroes one side's unread counter.
   *
   * Separate from {@link applyChange} because opening a conversation is not a change to
   * it: this write must leave `updatedAt` and `lastMessageAt` alone, or every agent
   * glancing at a thread would resurface it at the top of the inbox as freshly active.
   */
  abstract markRead(input: ChatMarkReadInput): Promise<ChatConversationRecord | null>;
}

/** Which side of a conversation is being served. Drives which unread counter zeroes. */
export type ChatAudience = 'PARTICIPANT' | 'AGENT';

/** One message in the thread, as persisted. */
export interface ChatMessageRecord {
  readonly id: string;
  readonly authorType: ChatAuthorType;
  readonly authorName: string;
  readonly body: string;
  readonly sentAt: Date;
}

/** A persisted conversation as services see it. */
export interface ChatConversationRecord {
  readonly id: string;
  readonly status: ChatConversationStatus;
  readonly subject: string;
  /** Owning customer, `usr_…`. Null for a guest conversation. */
  readonly customerUserId: string | null;
  /** The visitor behind a guest conversation. Null for a customer's. */
  readonly guest: { readonly name: string; readonly email: string } | null;
  readonly assignedAgentName: string | null;
  readonly messages: readonly ChatMessageRecord[];
  /** Agent-side messages the customer or guest has not seen. */
  readonly unreadCount: number;
  /** Customer/guest-side messages not yet surfaced in the agent inbox. */
  readonly agentUnreadCount: number;
  readonly lastMessageAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt: Date | null;
}

/** A conversation on its way in: the caller supplies everything except the minted id. */
export type NewChatConversation = Omit<ChatConversationRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** The fields a change may set. Everything else about a conversation is immutable. */
export type ChatPatch = Partial<
  Pick<
    ChatConversationRecord,
    | 'status'
    | 'assignedAgentName'
    | 'unreadCount'
    | 'agentUnreadCount'
    | 'lastMessageAt'
    | 'closedAt'
  >
>;

/** A targeted write to a conversation. */
export interface ChatChange {
  readonly id: string;
  readonly set: ChatPatch;
  readonly appendMessage?: ChatMessageRecord;
}

/** One side catching up on the thread. */
export interface ChatMarkReadInput {
  readonly id: string;
  readonly audience: ChatAudience;
}

/**
 * A cursor page over conversations. `userId` present scopes the query to one customer;
 * absent, the query is the agent inbox across every conversation.
 */
export interface ChatListQuery {
  readonly userId?: string;
  readonly status?: ChatConversationStatus;
  readonly cursor?: string;
  readonly limit: number;
}
