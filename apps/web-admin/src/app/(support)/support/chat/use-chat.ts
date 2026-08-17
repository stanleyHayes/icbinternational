/**
 * Reading and answering live chat conversations.
 *
 * Chat sits next to the ticket queue but is not the ticket queue: a conversation moves in
 * real time, may have a guest rather than an account holder behind it, and has no SLA.
 * It gets its own keys under the same console root so one invalidation can still clear
 * the lane.
 *
 * The stream keeps both caches warm between fetches — the inbox list and any open
 * thread — so the helpers that apply a pushed summary or message live here beside the
 * keys they write to, rather than inside the socket hook.
 */

'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  ChatAuthorType,
  type AdminChatConversation,
  type ChatConversationStatus,
  type ChatConversationSummary,
  type ChatMessage,
  type Paginated,
} from '@reliance/contracts';

import { CONSOLE_KEY, QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

const CHAT = 'chat' as const;

/** The inbox filter: one conversation state, or every state at once. */
export type ChatStatusFilter = ChatConversationStatus | 'ALL';

/** Cache keys for the live-chat inbox. */
export const chatKeys = {
  all: [CONSOLE_KEY, CHAT] as const,
  inbox: (status: ChatStatusFilter) => [CONSOLE_KEY, CHAT, 'inbox', status] as const,
  thread: (conversationId: string) => [CONSOLE_KEY, CHAT, 'thread', conversationId] as const,
};

/** The inbox is worked from the top: most recently active conversation first. */
function byRecentActivity(rows: readonly ChatConversationSummary[]): ChatConversationSummary[] {
  return [...rows].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Every cached inbox variant — one per status filter the screen has shown. */
function inboxEntries(
  queryClient: QueryClient,
): [readonly unknown[], Paginated<ChatConversationSummary> | undefined][] {
  return queryClient.getQueriesData<Paginated<ChatConversationSummary>>({
    queryKey: [CONSOLE_KEY, CHAT, 'inbox'],
  });
}

/**
 * Applies a pushed summary to every cached inbox list.
 *
 * A conversation whose state no longer matches a filter leaves that list; one that now
 * matches enters it. Either way it takes its place by activity, because a conversation
 * that just moved is the one an agent is most likely to need next.
 */
export function upsertInboxSummary(
  queryClient: QueryClient,
  summary: ChatConversationSummary,
): void {
  for (const [key, data] of inboxEntries(queryClient)) {
    if (!data) continue;
    const filter = key[3] as ChatStatusFilter;
    const belongs = filter === 'ALL' || summary.status === filter;
    const rest = data.data.filter((row) => row.id !== summary.id);
    const rows = byRecentActivity(belongs ? [summary, ...rest] : rest);

    queryClient.setQueryData(key, {
      ...data,
      data: rows,
      page: {
        ...data.page,
        total: rows.length === data.data.length ? data.page.total : rows.length,
      },
    });
  }
}

/**
 * Reflects a pushed message on the inbox rows.
 *
 * A customer or guest message the agent has not opened is unread work, so the count
 * rises — unless the thread is already in the cache, which means the agent is looking at
 * it and the message is read the moment it lands.
 */
export function noteInboxMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: ChatMessage,
): void {
  const threadOpen = queryClient.getQueryData(chatKeys.thread(conversationId)) !== undefined;
  const fromParticipant =
    message.authorType === ChatAuthorType.CUSTOMER || message.authorType === ChatAuthorType.GUEST;

  for (const [key, data] of inboxEntries(queryClient)) {
    if (!data) continue;
    const rows = byRecentActivity(
      data.data.map((row) => {
        if (row.id !== conversationId) return row;
        return {
          ...row,
          updatedAt: message.sentAt,
          agentUnreadCount:
            fromParticipant && !threadOpen ? row.agentUnreadCount + 1 : row.agentUnreadCount,
        };
      }),
    );
    queryClient.setQueryData(key, { ...data, data: rows });
  }
}

/**
 * Appends a message to a cached thread. A message already present is skipped: the REST
 * reply lands in the mutation response and again over the stream, and only the
 * dedupe keeps that from rendering twice.
 */
export function appendThreadMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: ChatMessage,
): void {
  queryClient.setQueryData<AdminChatConversation>(chatKeys.thread(conversationId), (current) => {
    if (!current) return current;
    if (current.messages.some((existing) => existing.id === message.id)) return current;
    return { ...current, updatedAt: message.sentAt, messages: [...current.messages, message] };
  });
}

/**
 * Clears a conversation's unread badge in the inbox caches.
 *
 * Reading the thread clears the count server-side; this keeps the list the agent is
 * looking at in step without waiting on the next fetch.
 */
export function markConversationRead(queryClient: QueryClient, conversationId: string): void {
  for (const [key, data] of inboxEntries(queryClient)) {
    if (!data) continue;
    queryClient.setQueryData(key, {
      ...data,
      data: data.data.map((row) =>
        row.id === conversationId ? { ...row, agentUnreadCount: 0 } : row,
      ),
    });
  }
}

/** The inbox, most recently active first. The stream reorders it between fetches. */
export function useChatConversations(
  status: ChatStatusFilter,
  options?: { readonly refetchInterval?: number | false },
) {
  const client = useApiClient();

  return useQuery({
    queryKey: chatKeys.inbox(status),
    queryFn: async ({ signal }) =>
      client.admin.chatConversations(
        { limit: QUEUE_PAGE_SIZE, ...(status === 'ALL' ? {} : { status }) },
        { signal },
      ),
    refetchInterval: options?.refetchInterval ?? false,
    ...queueQueryOptions,
  });
}

/** One conversation, with its full thread. Opening it clears the agent's unread count. */
export function useChatThread(conversationId: string | null) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    enabled: conversationId !== null,
    queryFn: async ({ signal }) => {
      const conversation = (await client.admin.chatConversation(conversationId ?? '', { signal }))
        .data;
      markConversationRead(queryClient, conversation.id);
      return conversation;
    },
    ...queueQueryOptions,
  });
}

/** A reply to a conversation, sent as the signed-in agent. */
export function usePostChatMessage() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      readonly conversationId: string;
      readonly body: string;
    }): Promise<ChatMessage> =>
      (await client.admin.postChatMessage(input.conversationId, { body: input.body })).data,
    // The reply also arrives over the stream; appending here keeps the thread honest in
    // polling mode, and the dedupe in appendThreadMessage absorbs the duplicate.
    onSuccess: (message, input) => {
      appendThreadMessage(queryClient, input.conversationId, message);
      noteInboxMessage(queryClient, input.conversationId, message);
    },
  });
}

/** Closes a conversation. Idempotent server-side; appends a system message. */
export function useCloseChat() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string): Promise<AdminChatConversation> =>
      (await client.admin.closeChatConversation(conversationId)).data,
    onSuccess: (conversation) => {
      queryClient.setQueryData(chatKeys.thread(conversation.id), conversation);
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
}
