/**
 * Live chat handlers: customer threads, guest sessions and the agent inbox.
 *
 * Conversations are stored in the agent-facing shape; the customer and guest routes
 * project it down to the participant view. Guest calls are authorised by the bearer
 * token minted when the conversation was created — the token map lives in the database
 * so `resetMockDatabase()` clears it with everything else.
 */

import {
  ChatAuthorType,
  ChatConversationStatus,
  ErrorCode,
  routes,
  type AdminChatConversation,
  type ChatConversation,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatStreamToken,
} from '@reliance/contracts';

import type { MockDatabase } from '../db/types.js';
import { mockId, opaqueId } from '../faker.js';

import {
  failure,
  MockMethod,
  notFound,
  raw,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const STREAM_TOKEN_MINUTES = 15;

/** The participant view: the admin-only fields stripped off. */
function participantView(conversation: AdminChatConversation): ChatConversation {
  return {
    id: conversation.id,
    status: conversation.status,
    subject: conversation.subject,
    messages: conversation.messages,
    unreadCount: conversation.unreadCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    closedAt: conversation.closedAt,
  };
}

/** The inbox list view: the thread omitted. */
function summaryView(conversation: AdminChatConversation): ChatConversationSummary {
  return {
    id: conversation.id,
    status: conversation.status,
    subject: conversation.subject,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    closedAt: conversation.closedAt,
    customerUserId: conversation.customerUserId,
    guest: conversation.guest,
    assignedAgentName: conversation.assignedAgentName,
    agentUnreadCount: conversation.agentUnreadCount,
  };
}

function mintStreamToken(db: MockDatabase): ChatStreamToken {
  return { token: opaqueId(), expiresAt: db.clock.minutesAhead(STREAM_TOKEN_MINUTES) };
}

function readBody(body: unknown): string {
  const input = (body ?? {}) as Record<string, unknown>;
  return typeof input.body === 'string' ? input.body : '';
}

/** A message from the signed-in customer. */
function customerMessage(db: MockDatabase, body: unknown): ChatMessage {
  return {
    id: mockId('cmsg'),
    authorType: ChatAuthorType.CUSTOMER,
    authorName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
    body: readBody(body),
    sentAt: db.clock.nowIso(),
  };
}

/** Records a message on a conversation and returns the stored version. */
function appendMessage(
  db: MockDatabase,
  index: number,
  conversation: AdminChatConversation,
  message: ChatMessage,
): AdminChatConversation {
  const updated: AdminChatConversation = {
    ...conversation,
    updatedAt: message.sentAt,
    // The counter on the *other* side goes up: the author has obviously seen their own.
    unreadCount:
      message.authorType === ChatAuthorType.AGENT
        ? conversation.unreadCount + 1
        : conversation.unreadCount,
    agentUnreadCount:
      message.authorType === ChatAuthorType.AGENT
        ? conversation.agentUnreadCount
        : conversation.agentUnreadCount + 1,
    messages: [...conversation.messages, message],
  };
  db.chatConversations[index] = updated;
  return updated;
}

/** The conversation a guest bearer token authorises, or null when it does not. */
function resolveGuest(
  db: MockDatabase,
  headers: Headers,
  id: string,
): AdminChatConversation | null {
  const header = headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (token === '' || db.chatGuestTokens[token] !== id) return null;
  return db.chatConversations.find((candidate) => candidate.id === id) ?? null;
}

function unauthenticatedGuest(): ReturnType<typeof failure> {
  return failure(ErrorCode.UNAUTHENTICATED, 'A valid guest token is required.');
}

function closedConversation(): ReturnType<typeof failure> {
  return failure(ErrorCode.CONFLICT, 'This conversation is closed.');
}

/** The customer's own conversations. */
export const chatHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.chat.conversations, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.chatConversations
        .filter(
          (conversation) =>
            conversation.customerUserId === db.currentUser.id &&
            (!status || conversation.status === status),
        )
        .map(participantView),
      query,
    );
  }),

  route(MockMethod.POST, routes.chat.conversations, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const now = db.clock.nowIso();
    const conversation: AdminChatConversation = {
      id: mockId('cnv'),
      status: ChatConversationStatus.OPEN,
      subject: typeof input.subject === 'string' ? input.subject : 'New conversation',
      messages: [customerMessage(db, body)],
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      customerUserId: db.currentUser.id,
      guest: null,
      assignedAgentName: null,
      agentUnreadCount: 1,
    };

    db.chatConversations.unshift(conversation);
    return resourceCreated(participantView(conversation));
  }),

  route(MockMethod.GET, routes.chat.conversation(':id'), ({ db, params }) => {
    const conversation = db.chatConversations.find(
      (candidate) =>
        candidate.id === params.id && candidate.customerUserId === db.currentUser.id,
    );
    return conversation ? resourceOk(participantView(conversation)) : notFound('That conversation');
  }),

  route(MockMethod.POST, routes.chat.messages(':id'), ({ body, db, params }) => {
    const index = db.chatConversations.findIndex(
      (candidate) =>
        candidate.id === params.id && candidate.customerUserId === db.currentUser.id,
    );
    const conversation = db.chatConversations[index];
    if (index === -1 || !conversation) return notFound('That conversation');
    if (conversation.status === ChatConversationStatus.CLOSED) return closedConversation();

    const message = customerMessage(db, body);
    appendMessage(db, index, conversation, message);
    return resourceCreated(message);
  }),

  route(MockMethod.POST, routes.chat.wsToken, ({ db }) => resourceOk(mintStreamToken(db))),

  /**
   * The WebSocket endpoint.
   *
   * A single heartbeat frame rather than an open socket: MSW cannot hold a WebSocket
   * connection, and a UI that gets one well-formed `ChatStreamEvent` can still prove its
   * parser and its reconnect logic — the same call the notification stream makes.
   */
  route(MockMethod.GET, routes.chat.stream, ({ db }) =>
    raw(JSON.stringify({ event: 'heartbeat', data: { at: db.clock.nowIso() } })),
  ),
];

/** Guest sessions from the public marketing site. */
export const guestChatHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.public.chat.conversations, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const name = typeof input.name === 'string' ? input.name : 'Website visitor';
    const email = typeof input.email === 'string' ? input.email : '';
    const now = db.clock.nowIso();
    const streamToken = mintStreamToken(db);
    const conversation: AdminChatConversation = {
      id: mockId('cnv'),
      status: ChatConversationStatus.OPEN,
      subject: 'Website enquiry',
      messages: [
        {
          id: mockId('cmsg'),
          authorType: ChatAuthorType.GUEST,
          authorName: name,
          body: readBody(body),
          sentAt: now,
        },
      ],
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      customerUserId: null,
      guest: { name, email },
      assignedAgentName: null,
      agentUnreadCount: 1,
    };

    db.chatConversations.unshift(conversation);
    db.chatGuestTokens[streamToken.token] = conversation.id;
    return resourceCreated({ conversation: participantView(conversation), streamToken });
  }),

  route(MockMethod.GET, routes.public.chat.conversation(':id'), ({ db, headers, params }) => {
    const conversation = resolveGuest(db, headers, params.id ?? '');
    if (!conversation) return unauthenticatedGuest();
    return resourceOk(participantView(conversation));
  }),

  route(MockMethod.POST, routes.public.chat.messages(':id'), ({ body, db, headers, params }) => {
    const conversation = resolveGuest(db, headers, params.id ?? '');
    if (!conversation) return unauthenticatedGuest();
    if (conversation.status === ChatConversationStatus.CLOSED) return closedConversation();

    const message: ChatMessage = {
      id: mockId('cmsg'),
      authorType: ChatAuthorType.GUEST,
      authorName: conversation.guest?.name ?? 'Guest',
      body: readBody(body),
      sentAt: db.clock.nowIso(),
    };
    const index = db.chatConversations.findIndex((candidate) => candidate.id === conversation.id);
    appendMessage(db, index, conversation, message);
    return resourceCreated(message);
  }),
];

/** The agent inbox. */
export const adminChatHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.admin.chat.conversations, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.chatConversations
        .filter((conversation) => !status || conversation.status === status)
        .map(summaryView),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.admin.chat.conversation(':id'), ({ db, params }) => {
    const conversation = db.chatConversations.find((candidate) => candidate.id === params.id);
    return conversation ? resourceOk(conversation) : notFound('That conversation');
  }),

  route(MockMethod.POST, routes.admin.chat.messages(':id'), ({ body, db, params }) => {
    const index = db.chatConversations.findIndex((candidate) => candidate.id === params.id);
    const conversation = db.chatConversations[index];
    if (index === -1 || !conversation) return notFound('That conversation');
    if (conversation.status === ChatConversationStatus.CLOSED) return closedConversation();

    const message: ChatMessage = {
      id: mockId('cmsg'),
      authorType: ChatAuthorType.AGENT,
      authorName: conversation.assignedAgentName ?? 'Support agent',
      body: readBody(body),
      sentAt: db.clock.nowIso(),
    };
    appendMessage(db, index, conversation, message);
    return resourceCreated(message);
  }),

  route(MockMethod.POST, routes.admin.chat.close(':id'), ({ db, params }) => {
    const index = db.chatConversations.findIndex((candidate) => candidate.id === params.id);
    const conversation = db.chatConversations[index];
    if (index === -1 || !conversation) return notFound('That conversation');

    const closed: AdminChatConversation = {
      ...conversation,
      status: ChatConversationStatus.CLOSED,
      closedAt: db.clock.nowIso(),
      updatedAt: db.clock.nowIso(),
    };
    db.chatConversations[index] = closed;
    return resourceOk(closed);
  }),

  route(MockMethod.POST, routes.admin.chat.wsToken, ({ db }) => resourceOk(mintStreamToken(db))),
];
