import {
  type TicketPriority,
  type TicketStatus,
  type TicketTopic,
  type TicketMessage,
} from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';

/**
 * What a service is allowed to know about ticket persistence.
 *
 * An abstract class rather than an interface because Nest resolves it as both an injection
 * token and a type. Services never see a Mongoose document — only these plain records — so
 * no handler can rewrite a thread outside the store's targeted writes.
 *
 * No method takes a `ClientSession`, and that is a statement rather than an omission: a
 * ticket is one document, nothing here posts to the ledger, and every change is a single
 * atomic update. Threading a session through would imply a multi-document invariant this
 * module does not have.
 */
export abstract class TicketStore {
  abstract insert(row: NewTicket): Promise<TicketRecord>;

  abstract findByPublicId(id: string): Promise<TicketRecord | null>;

  /** The customer's own conversations, newest first. */
  abstract listForUser(query: TicketListQuery): Promise<PageResult<TicketRecord>>;

  /** The support queue, longest-waiting first. */
  abstract listForAgent(query: TicketListQuery): Promise<PageResult<TicketRecord>>;

  /**
   * Applies a patch and, when the change carries one, appends a message in the same write.
   *
   * Returns the updated record, or `null` when the ticket no longer exists. The append
   * rides the same update so a reply can never land without the state it produced, or the
   * state without the reply that explains it.
   */
  abstract applyChange(change: TicketChange): Promise<TicketRecord | null>;

  /**
   * Records that one side has now seen the whole thread.
   *
   * Separate from {@link applyChange} because opening a conversation is not a change to
   * it: this write must leave `updatedAt` alone, or every customer glancing at their own
   * ticket would resurface it at the top of the list as freshly updated.
   */
  abstract markRead(input: MarkReadInput): Promise<TicketRecord | null>;
}

/** Which side of a conversation is being served. Drives the unread count. */
export type TicketAudience = 'CUSTOMER' | 'AGENT';

/** One message in the thread, as persisted. */
export interface TicketMessageRecord {
  readonly id: string;
  readonly authorType: TicketMessage['authorType'];
  readonly authorName: string;
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly sentAt: Date;
}

/** A persisted ticket as services see it. */
export interface TicketRecord {
  readonly id: string;
  /** Denormalised owner — every customer query is scoped by it, never by a lookup. */
  readonly userId: string;
  readonly subject: string;
  readonly topic: TicketTopic;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly assignedAgentName: string | null;
  /** The movement the customer was looking at when they wrote, when they named one. */
  readonly relatedTransactionId: string | null;
  readonly messages: readonly TicketMessageRecord[];
  /**
   * How far down the thread each side has read, as a count of messages.
   *
   * A position rather than a timestamp. Two messages written in the same millisecond are
   * ordered by their place in the thread and by nothing else, so a read mark compared
   * against a clock has an ambiguous answer for every message that shares its instant —
   * and on this platform the clock can be frozen outright, which makes every instant the
   * same one. A count has no such edge: messages are only ever appended, so "I have read
   * four" stays true and stays exact.
   */
  readonly customerReadUpTo: number;
  readonly agentReadUpTo: number;
  readonly slaDueAt: Date | null;
  readonly satisfactionRating: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
}

/** A conversation on its way in: the caller supplies everything except the minted id. */
export type NewTicket = Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** The fields a change may set. Everything else about a ticket is immutable. */
export type TicketPatch = Partial<
  Pick<
    TicketRecord,
    | 'status'
    | 'priority'
    | 'assignedAgentName'
    | 'slaDueAt'
    | 'satisfactionRating'
    | 'customerReadUpTo'
    | 'agentReadUpTo'
    | 'resolvedAt'
  >
>;

/** A targeted write to a conversation. */
export interface TicketChange {
  readonly id: string;
  readonly set: TicketPatch;
  readonly appendMessage?: TicketMessageRecord;
}

/** One side catching up on the thread. */
export interface MarkReadInput {
  readonly id: string;
  readonly audience: TicketAudience;
}

/** A cursor page over tickets. `userId` present scopes the query to one customer. */
export interface TicketListQuery {
  readonly userId?: string;
  readonly status?: TicketStatus;
  readonly topic?: TicketTopic;
  readonly cursor?: string;
  readonly limit: number;
}
