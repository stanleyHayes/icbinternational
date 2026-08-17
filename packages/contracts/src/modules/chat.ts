/**
 * Live support chat.
 *
 * Chat is not a ticket with a faster clock: a ticket is an asynchronous, SLA-tracked case;
 * a chat conversation is a real-time session that may not even have an authenticated
 * customer behind it (the marketing site's guest chat). The two are modelled separately
 * for exactly that reason.
 *
 * Transport: messages are SENT over REST (envelope, CSRF, Zod validation) and RECEIVED
 * over a WebSocket (`routes.chat.stream`). The socket carries `ChatStreamEvent`s only —
 * it never accepts writes, so a hijacked socket can read what its token already entitles
 * it to and nothing more.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  emailSchema,
  entityId,
  isoDateTimeSchema,
  longTextSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const ChatAuthorType = {
  CUSTOMER: 'CUSTOMER',
  GUEST: 'GUEST',
  AGENT: 'AGENT',
  SYSTEM: 'SYSTEM',
} as const;
export type ChatAuthorType = (typeof ChatAuthorType)[keyof typeof ChatAuthorType];

export const ChatConversationStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type ChatConversationStatus =
  (typeof ChatConversationStatus)[keyof typeof ChatConversationStatus];

export const chatMessageSchema = z.object({
  id: entityId('cmsg'),
  authorType: z.enum(ChatAuthorType),
  authorName: shortTextSchema,
  body: longTextSchema,
  sentAt: isoDateTimeSchema,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** A conversation as a participant (customer/guest) sees it — the full thread. */
export const chatConversationSchema = z.object({
  id: entityId('cnv'),
  status: z.enum(ChatConversationStatus),
  subject: shortTextSchema,
  messages: z.array(chatMessageSchema),
  /** Messages the participant has not seen; zero on the agent side (uses agentUnreadCount). */
  unreadCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});
export type ChatConversation = z.infer<typeof chatConversationSchema>;

/** A conversation as an agent sees it in the inbox — participant identity included. */
export const adminChatConversationSchema = chatConversationSchema.extend({
  customerUserId: entityId('usr').nullable(),
  /** Present when the conversation was started from the public marketing site. */
  guest: z.object({ name: shortTextSchema, email: emailSchema }).nullable(),
  assignedAgentName: shortTextSchema.nullable(),
  /** Unread from the agent side: customer/guest messages not yet surfaced in the inbox. */
  agentUnreadCount: z.number().int(),
});
export type AdminChatConversation = z.infer<typeof adminChatConversationSchema>;

/** List shape — thread omitted, last message kept for the inbox preview. */
export const chatConversationSummarySchema = adminChatConversationSchema.omit({
  messages: true,
  unreadCount: true,
});
export type ChatConversationSummary = z.infer<typeof chatConversationSummarySchema>;

// --- Requests ---------------------------------------------------------------

/** Starts a guest conversation from the public site. Returns the thread + a WS token. */
export const createGuestChatRequestSchema = z.object({
  name: shortTextSchema,
  email: emailSchema,
  body: longTextSchema,
});
export type CreateGuestChatRequest = z.infer<typeof createGuestChatRequestSchema>;

export const createChatConversationRequestSchema = z.object({
  subject: shortTextSchema,
  body: longTextSchema,
});
export type CreateChatConversationRequest = z.infer<typeof createChatConversationRequestSchema>;

export const postChatMessageRequestSchema = z.object({
  body: longTextSchema,
});
export type PostChatMessageRequest = z.infer<typeof postChatMessageRequestSchema>;

export const listChatConversationsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(ChatConversationStatus).optional(),
});

/** Response of any ws-token mint: a short-lived credential for `routes.chat.stream`. */
export const chatStreamTokenSchema = z.object({
  token: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type ChatStreamToken = z.infer<typeof chatStreamTokenSchema>;

/** Guest session: conversation plus the token that authorises its stream and replies. */
export const guestChatSessionSchema = z.object({
  conversation: chatConversationSchema,
  streamToken: chatStreamTokenSchema,
});
export type GuestChatSession = z.infer<typeof guestChatSessionSchema>;

// --- WebSocket events ---------------------------------------------------------

/** Frame pushed down the live chat stream. Receive-only; see module docstring. */
export const chatStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('chat.message'),
    data: z.object({ conversationId: entityId('cnv'), message: chatMessageSchema }),
  }),
  z.object({ event: z.literal('chat.conversation'), data: chatConversationSummarySchema }),
  z.object({ event: z.literal('heartbeat'), data: z.object({ at: isoDateTimeSchema }) }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
