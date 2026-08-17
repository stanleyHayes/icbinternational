/**
 * Live support chat: customer threads, guest sessions and the WebSocket stream.
 *
 * Messages are sent over REST and received over the socket at `routes.chat.stream`.
 * `streamUrl` returns a URL rather than opening the connection — the same arrangement as
 * `notifications.streamUrl`, because whoever owns the socket owns reconnection, backoff
 * and teardown, and that has to be the app.
 *
 * The guest helpers take the token from `createGuestConversation`'s session response and
 * send it as `Authorization: Bearer`. They run with `allowRefresh: false`: a guest token
 * that expires has no refresh cookie behind it, so the shared refresh flow would only
 * turn an honest 401 into a confusing session probe.
 */

import {
  chatConversationSchema,
  chatMessageSchema,
  chatStreamTokenSchema,
  guestChatSessionSchema,
  paginated,
  resource,
  routes,
  type ChatConversation,
  type ChatConversationStatus,
  type ChatMessage,
  type ChatStreamToken,
  type CreateChatConversationRequest,
  type CreateGuestChatRequest,
  type GuestChatSession,
  type Paginated,
  type PostChatMessageRequest,
  type Resource,
} from '@reliance/contracts';

import type { ResolvedConfig } from '../core/config.js';
import { joinUrl } from '../core/query.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions, RequestOptions } from '../core/types.js';

const conversationList = paginated(chatConversationSchema);
const conversationResource = resource(chatConversationSchema);
const messageResource = resource(chatMessageSchema);
const streamTokenResource = resource(chatStreamTokenSchema);
const guestSessionResource = resource(guestChatSessionSchema);

/** Filters for the conversation list. */
export type ListChatConversationsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: ChatConversationStatus | undefined;
};

/** Builds the `client.chat` group. */
export function createChatResource(http: HttpTransport, config: ResolvedConfig) {
  return {
    /** The customer's own conversations. */
    listConversations: (
      query?: ListChatConversationsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<ChatConversation>> =>
      http.get({ ...options, path: routes.chat.conversations, query, schema: conversationList }),

    /** Opens a conversation, seeding it with the first message. */
    createConversation: (
      body: CreateChatConversationRequest,
      options?: MutationOptions,
    ): Promise<Resource<ChatConversation>> =>
      http.post({
        ...options,
        path: routes.chat.conversations,
        body,
        schema: conversationResource,
      }),

    /** One conversation, with its whole thread. */
    getConversation: (id: string, options?: QueryOptions): Promise<Resource<ChatConversation>> =>
      http.get({ ...options, path: routes.chat.conversation(id), schema: conversationResource }),

    /** Sends a message. Replies arrive over the stream, not this response. */
    postMessage: (
      id: string,
      body: PostChatMessageRequest,
      options?: MutationOptions,
    ): Promise<Resource<ChatMessage>> =>
      http.post({ ...options, path: routes.chat.messages(id), body, schema: messageResource }),

    /** Mints the short-lived token that authorises a `streamUrl` connection. */
    wsToken: (options?: MutationOptions): Promise<Resource<ChatStreamToken>> =>
      http.post({ ...options, path: routes.chat.wsToken, schema: streamTokenResource }),

    /**
     * URL for the live stream, with the token from `wsToken` already attached.
     *
     * Open it with `new WebSocket(url)`; frames conform to the contract's
     * `chatStreamEventSchema`. The socket is receive-only — it never accepts writes.
     */
    streamUrl: (token: string): string => {
      const path = `${config.prefix}${routes.chat.stream}`;
      const url = toWebSocketUrl(joinUrl(config.baseUrl, path));
      return `${url}?token=${encodeURIComponent(token)}`;
    },

    /**
     * Starts a guest conversation from the public marketing site.
     *
     * The returned session pairs the thread with the guest token that authorises the
     * other two guest calls and the stream connection.
     */
    createGuestConversation: (
      body: CreateGuestChatRequest,
      options?: MutationOptions,
    ): Promise<Resource<GuestChatSession>> =>
      http.post({
        ...options,
        path: routes.public.chat.conversations,
        body,
        schema: guestSessionResource,
        allowRefresh: false,
      }),

    /** One guest conversation. Bearer-authenticated with the session's stream token. */
    getGuestConversation: (
      token: string,
      id: string,
      options?: QueryOptions,
    ): Promise<Resource<ChatConversation>> =>
      http.get({
        ...options,
        path: routes.public.chat.conversation(id),
        schema: conversationResource,
        headers: bearerHeaders(token, options),
        allowRefresh: false,
      }),

    /** Sends a guest message. Bearer-authenticated with the session's stream token. */
    postGuestMessage: (
      token: string,
      id: string,
      body: PostChatMessageRequest,
      options?: MutationOptions,
    ): Promise<Resource<ChatMessage>> =>
      http.post({
        ...options,
        path: routes.public.chat.messages(id),
        body,
        schema: messageResource,
        headers: bearerHeaders(token, options),
        allowRefresh: false,
      }),
  };
}

/** The `client.chat` group. */
export type ChatResource = ReturnType<typeof createChatResource>;

/**
 * A `Bearer` header for a guest token.
 *
 * Caller-supplied headers are spread last, matching the request-builder's "explicit
 * override always wins" rule.
 */
function bearerHeaders(
  token: string,
  options?: RequestOptions,
): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${token}`, ...options?.headers };
}

/**
 * `http`→`ws`, `https`→`wss`. An empty `baseUrl` yields a relative path, exactly as
 * `notifications.streamUrl` does — same-origin proxies resolve it against the page.
 */
function toWebSocketUrl(url: string): string {
  return url.replace(/^http/, 'ws');
}
