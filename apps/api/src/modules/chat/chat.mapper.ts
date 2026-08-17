import {
  type AdminChatConversation,
  type ChatConversation,
  type ChatConversationSummary,
  type ChatMessage,
} from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

import { type ChatConversationDocument } from './chat.schema.js';
import { type ChatConversationRecord, type ChatMessageRecord } from './chat.store.js';

/**
 * Mongoose document to the plain record services see.
 *
 * A service holding a `HydratedDocument` is a service holding `.save()` — a way to
 * rewrite a thread outside the store's targeted writes. The mapping happens here, once,
 * at the repository boundary.
 */
export function toChatRecord(document: ChatConversationDocument): ChatConversationRecord {
  const doc = document.toObject();

  return {
    id: doc.id,
    status: doc.status,
    subject: doc.subject,
    customerUserId: doc.customerUserId,
    guest: doc.guest ? { name: doc.guest.name, email: doc.guest.email } : null,
    assignedAgentName: doc.assignedAgentName,
    messages: doc.messages.map((message) => ({ ...message })),
    unreadCount: doc.unreadCount,
    agentUnreadCount: doc.agentUnreadCount,
    lastMessageAt: doc.lastMessageAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    closedAt: doc.closedAt,
  };
}

/**
 * Persistence record to the wire contract a participant sees.
 *
 * Two stored fields are deliberately absent because the participant contract has no
 * home for them: `customerUserId`/`guest` are how the record is scoped and identified
 * to staff rather than anything its owner needs told, and `agentUnreadCount` is the
 * inbox's badge, not the participant's.
 */
export function toContractConversation(record: ChatConversationRecord): ChatConversation {
  return {
    id: record.id,
    status: record.status,
    subject: record.subject,
    messages: record.messages.map(toWireMessage),
    unreadCount: record.unreadCount,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    closedAt: record.closedAt ? toIso(record.closedAt) : null,
  };
}

/** The full thread as staff see it — participant identity and both badges included. */
export function toAdminConversation(record: ChatConversationRecord): AdminChatConversation {
  return {
    ...toContractConversation(record),
    customerUserId: record.customerUserId,
    guest: record.guest ? { name: record.guest.name, email: record.guest.email } : null,
    assignedAgentName: record.assignedAgentName,
    agentUnreadCount: record.agentUnreadCount,
  };
}

/** The inbox list shape: thread omitted, the participant-side badge with it. */
export function toConversationSummary(record: ChatConversationRecord): ChatConversationSummary {
  return {
    id: record.id,
    status: record.status,
    subject: record.subject,
    customerUserId: record.customerUserId,
    guest: record.guest ? { name: record.guest.name, email: record.guest.email } : null,
    assignedAgentName: record.assignedAgentName,
    agentUnreadCount: record.agentUnreadCount,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    closedAt: record.closedAt ? toIso(record.closedAt) : null,
  };
}

/** One message in its wire shape — also the payload of a `chat.message` stream frame. */
export function toWireMessage(message: ChatMessageRecord): ChatMessage {
  return {
    id: message.id,
    authorType: message.authorType,
    authorName: message.authorName,
    body: message.body,
    sentAt: toIso(message.sentAt),
  };
}
