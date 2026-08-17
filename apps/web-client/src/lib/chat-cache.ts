/**
 * Where the chat's two transports meet.
 *
 * Messages go OUT over REST and arrive IN over the stream, and both paths write to the
 * same React Query cache. Every append is deduplicated by message id, because the
 * customer's own send will arrive twice: once as the REST response and once echoed down
 * the socket.
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  ChatConversationStatus,
  type ChatConversation,
  type ChatMessage,
  type ChatStreamEvent,
} from '@reliance/contracts';

import { queryKeys } from './query-keys';

/** Appends a message to a cached conversation, refusing to record the same id twice. */
export function appendChatMessage(
  conversation: ChatConversation,
  message: ChatMessage,
): ChatConversation {
  if (conversation.messages.some((existing) => existing.id === message.id)) return conversation;
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: message.sentAt,
  };
}

/** Writes a message into its conversation's cache entry, when that entry exists. */
export function appendToCachedConversation(
  queryClient: QueryClient,
  conversationId: string,
  message: ChatMessage,
): void {
  queryClient.setQueryData<ChatConversation>(
    queryKeys.chat.conversation(conversationId),
    (current) => (current ? appendChatMessage(current, message) : current),
  );
}

/**
 * Applies one validated stream frame to the cache.
 *
 * A message is appended in place so the open thread updates live; a conversation summary
 * invalidates the thread it names because the change (status, assignment) is not in the
 * frame. Either way the list is stale: unread counts and recency both live there.
 */
export function applyChatStreamEvent(queryClient: QueryClient, event: ChatStreamEvent): void {
  if (event.event === 'chat.message') {
    appendToCachedConversation(queryClient, event.data.conversationId, event.data.message);
  } else if (event.event === 'chat.conversation') {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.chat.conversation(event.data.id),
    });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() });
}

/**
 * Marks a cached conversation closed.
 *
 * This is the answer to a 409 on send: the agent closed the conversation while the
 * customer was still writing, and the composer has to become the closed notice.
 */
export function markConversationClosed(queryClient: QueryClient, conversationId: string): void {
  queryClient.setQueryData<ChatConversation>(
    queryKeys.chat.conversation(conversationId),
    (current) =>
      current
        ? {
            ...current,
            status: ChatConversationStatus.CLOSED,
            closedAt: current.closedAt ?? new Date().toISOString(),
          }
        : current,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() });
}
