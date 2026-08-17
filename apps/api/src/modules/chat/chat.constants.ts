/**
 * Constants for live support chat.
 *
 * The connection cap and heartbeat exist for the same reasons the notification stream
 * caps and heartbeats do: a browser tab with a leaking effect can otherwise exhaust the
 * server's sockets, and an intermediary that sees no bytes for a minute closes the
 * connection silently.
 */

/** Mongoose model token. */
export const CHAT_MODEL = 'ChatConversation';

/** MongoDB collection. */
export const CHAT_COLLECTION = 'chat_conversations';

/** Seconds a stream token stays valid. Short: it authorises a live channel, nothing else. */
export const CHAT_WS_TOKEN_TTL_SECONDS = 300;

/** Milliseconds between heartbeat frames on an idle connection. */
export const CHAT_STREAM_HEARTBEAT_MS = 25_000;

/** Open sockets one principal may hold at once, across every tab they have open. */
export const MAX_CHAT_CONNECTIONS_PER_PRINCIPAL = 8;

/** Audit trail entity family. */
export const CHAT_AUDIT_ENTITY = 'chat_conversation';

/**
 * The fields the audit trail keeps on a conversation.
 *
 * Deliberately none of the thread, for the same reason the ticket trail keeps none of
 * the conversation: a chat thread is dense free-text PII, and copying every revision of
 * it into an append-only hash chain is a disclosure the trail does not need to make.
 */
export const CHAT_AUDIT_CAPTURE_FIELDS = Object.freeze([
  'id',
  'status',
  'customerUserId',
  'assignedAgentName',
  'closedAt',
]);
