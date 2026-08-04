import { type Ticket, type TicketMessage } from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

import { type TicketDocument } from './ticket.schema.js';
import {
  type TicketAudience,
  type TicketMessageRecord,
  type TicketRecord,
} from './ticket.store.js';

/**
 * Mongoose document to the plain record services see.
 *
 * A service holding a `HydratedDocument` is a service holding `.save()` — a way to rewrite
 * a thread outside the store's targeted writes. The mapping happens here, once, at the
 * repository boundary.
 */
export function toTicketRecord(document: TicketDocument): TicketRecord {
  const doc = document.toObject();

  return {
    id: doc.id,
    userId: doc.userId,
    subject: doc.subject,
    topic: doc.topic,
    status: doc.status,
    priority: doc.priority,
    assignedAgentName: doc.assignedAgentName,
    relatedTransactionId: doc.relatedTransactionId,
    messages: doc.messages.map((message) => ({
      ...message,
      attachmentIds: [...message.attachmentIds],
    })),
    customerReadUpTo: doc.customerReadUpTo,
    agentReadUpTo: doc.agentReadUpTo,
    slaDueAt: doc.slaDueAt,
    satisfactionRating: doc.satisfactionRating,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    resolvedAt: doc.resolvedAt,
  };
}

/**
 * Persistence record to the frozen wire contract, for one side of the conversation.
 *
 * The audience is a parameter because `unreadCount` is the only field in `ticketSchema`
 * whose answer depends on who is asking, and the alternative — two nearly identical
 * ticket types on the wire — would make every shared component take a union.
 *
 * Four stored fields are deliberately absent, because the contract has no home for them:
 * `userId` is how the record is scoped rather than anything its owner needs told, the two
 * read marks are the machinery behind `unreadCount`, and `relatedTransactionId` is
 * context for the agent that arrives in the opening message anyway.
 */
export function toContractTicket(record: TicketRecord, audience: TicketAudience): Ticket {
  return {
    id: record.id,
    subject: record.subject,
    topic: record.topic,
    status: record.status,
    priority: record.priority,
    assignedAgentName: record.assignedAgentName,
    messages: record.messages.map(toWireMessage),
    unreadCount: unreadCountFor(record, audience),
    slaDueAt: record.slaDueAt ? toIso(record.slaDueAt) : null,
    satisfactionRating: record.satisfactionRating,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    resolvedAt: record.resolvedAt ? toIso(record.resolvedAt) : null,
  };
}

/**
 * How many messages from the other side have arrived past where this side has read to.
 *
 * Your own messages never count: a badge that made a customer's own question look unread
 * would train them to ignore the badge. An automated message counts as unread to the
 * customer, because it is the bank speaking to them, and never to the agent, because it
 * is the bank speaking. A side that has never looked has read to position zero, which is
 * why a brand-new ticket shows the queue one unread message rather than none.
 */
export function unreadCountFor(record: TicketRecord, audience: TicketAudience): number {
  const isCustomer = audience === 'CUSTOMER';
  const readUpTo = isCustomer ? record.customerReadUpTo : record.agentReadUpTo;
  const fromTheOtherSide = (message: TicketMessageRecord): boolean =>
    isCustomer ? message.authorType !== 'CUSTOMER' : message.authorType === 'CUSTOMER';

  return record.messages.slice(readUpTo).filter(fromTheOtherSide).length;
}

function toWireMessage(message: TicketMessageRecord): TicketMessage {
  return {
    id: message.id,
    authorType: message.authorType,
    authorName: message.authorName,
    body: message.body,
    attachmentIds: [...message.attachmentIds],
    sentAt: toIso(message.sentAt),
  };
}
