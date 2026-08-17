/**
 * The live-chat inbox.
 *
 * List left, conversation right, both on one screen: chat is worked in real time, and an
 * agent who has to navigate away to answer a message has already answered it too late.
 * The list is ordered by last activity and reorders itself off the stream, so the row
 * that needs somebody is always near the top.
 *
 * The socket reports which transport is actually carrying events. When it cannot stay
 * up, the list falls back to polling — a screen that has quietly stopped updating is
 * worse than one that never claimed to stream.
 */

'use client';

import { useState } from 'react';

import type { ChatConversationSummary } from '@reliance/contracts';
import { Badge, cn, EmptyState, Tab, TabList, Tabs } from '@reliance/ui';

import {
  ConsoleScreen,
  QueueError,
  QueueLoading,
  ScreenPanel,
  useConsoleNow,
} from '@/components/compliance/kit';
import { formatElapsed, formatInstant } from '@/lib/format';

import { ChatThread } from './chat-thread';
import { useChatConversations, useChatThread, type ChatStatusFilter } from './use-chat';
import { useChatStream, type ChatSocketFactory } from './use-chat-stream';

const DESCRIPTION =
  'Live conversations from the app and the website. Replies go to the participant ' +
  'immediately, under your name.';

/** How often the inbox refetches while the socket is down. */
const POLL_INTERVAL_MS = 15_000;

const EMPTY_BY_FILTER: Record<ChatStatusFilter, string> = {
  OPEN: 'No open conversations. New chats from the app and the website land here.',
  CLOSED: 'No closed conversations yet.',
  ALL: 'No conversations yet. New chats from the app and the website land here.',
};

/** Who the agent is talking to: the guest's own name, or the fact of an account holder. */
function participant(conversation: ChatConversationSummary): {
  name: string;
  kind: 'Guest' | 'Customer';
} {
  return conversation.guest
    ? { name: conversation.guest.name, kind: 'Guest' }
    : { name: 'Customer', kind: 'Customer' };
}

/** The second row line: who, what kind of participant, and how much is unread. */
function RowMeta({ conversation }: Readonly<{ conversation: ChatConversationSummary }>) {
  const who = participant(conversation);

  return (
    <span className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-body text-fg-muted truncate text-sm">{who.name}</span>
        <Badge size="sm">{who.kind}</Badge>
        {conversation.status === 'CLOSED' && <Badge size="sm">Closed</Badge>}
      </span>
      {conversation.agentUnreadCount > 0 && (
        <Badge tone="accent" variant="solid" size="sm">
          {conversation.agentUnreadCount}
        </Badge>
      )}
    </span>
  );
}

interface ConversationRowProps {
  readonly conversation: ChatConversationSummary;
  readonly selected: boolean;
  readonly nowMs: number;
  readonly onOpen: (id: string) => void;
}

function ConversationRow({ conversation, selected, nowMs, onOpen }: ConversationRowProps) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(conversation.id)}
        className={cn(
          'hover:bg-surface-sunken flex w-full flex-col gap-1 px-4 py-3 text-left',
          selected && 'bg-accent-soft',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-body text-fg truncate text-sm font-medium">
            {conversation.subject}
          </span>
          <span
            className="text-fg-subtle shrink-0 font-mono text-xs"
            title={formatInstant(conversation.updatedAt)}
          >
            {formatElapsed(conversation.updatedAt, nowMs)}
          </span>
        </span>
        <RowMeta conversation={conversation} />
      </button>
    </li>
  );
}

interface ConversationListProps {
  readonly status: ChatStatusFilter;
  readonly inbox: ReturnType<typeof useChatConversations>;
  readonly openId: string | null;
  readonly nowMs: number;
  readonly onOpen: (id: string) => void;
}

/** The list itself, in whichever state the read is in. */
function ConversationList({ status, inbox, openId, nowMs, onOpen }: ConversationListProps) {
  const rows = inbox.data?.data ?? [];

  return (
    <>
      {inbox.isPending && <QueueLoading label="conversations" />}
      {inbox.isError && (
        <QueueError error={inbox.error} subject="the conversation list" onRetry={inbox.refetch} />
      )}
      {inbox.data && rows.length === 0 && (
        <EmptyState title="Nothing here" description={EMPTY_BY_FILTER[status]} />
      )}
      {rows.length > 0 && (
        <ul className="divide-border divide-y" aria-label="Conversations">
          {rows.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === openId}
              nowMs={nowMs}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </>
  );
}

interface ThreadPaneProps {
  readonly openId: string | null;
  readonly thread: ReturnType<typeof useChatThread>;
}

/** The right-hand pane: the open conversation, or the invitation to open one. */
function ThreadPane({ openId, thread }: ThreadPaneProps) {
  return (
    <ScreenPanel title={thread.data?.subject ?? 'Conversation'}>
      {openId === null && (
        <EmptyState
          title="Choose a conversation"
          description="Select a conversation to read the thread and reply."
        />
      )}
      {openId !== null && thread.isPending && <QueueLoading label="the conversation" />}
      {thread.isError && (
        <QueueError error={thread.error} subject="this conversation" onRetry={thread.refetch} />
      )}
      {thread.data && <ChatThread conversation={thread.data} />}
    </ScreenPanel>
  );
}

/** The live-chat inbox: the conversation list and the open thread. */
export function ChatInbox({ createSocket }: Readonly<{ createSocket?: ChatSocketFactory }>) {
  const [status, setStatus] = useState<ChatStatusFilter>('OPEN');
  const [openId, setOpenId] = useState<string | null>(null);
  const nowMs = useConsoleNow();

  const transport = useChatStream(createSocket);
  const inbox = useChatConversations(status, {
    refetchInterval: transport === 'polling' ? POLL_INTERVAL_MS : false,
  });
  const thread = useChatThread(openId);

  return (
    <ConsoleScreen title="Live chat" description={DESCRIPTION}>
      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <ScreenPanel title="Conversations" flush>
          <Tabs
            value={status}
            defaultValue="OPEN"
            onValueChange={(value) => setStatus(value as ChatStatusFilter)}
            className="px-4 pt-2"
          >
            <TabList label="Filter conversations by state">
              <Tab value="OPEN">Open</Tab>
              <Tab value="CLOSED">Closed</Tab>
              <Tab value="ALL">All</Tab>
            </TabList>
          </Tabs>
          <ConversationList
            status={status}
            inbox={inbox}
            openId={openId}
            nowMs={nowMs}
            onOpen={setOpenId}
          />
        </ScreenPanel>

        <ThreadPane openId={openId} thread={thread} />
      </div>
    </ConsoleScreen>
  );
}
