'use client';

/**
 * The live support chat widget.
 *
 * A floating button at the bottom-right of every signed-in screen opens a panel with the
 * customer's most recent conversation. Messages go out over REST and arrive over the
 * receive-only stream ({@link useChatStream}); the two meet in the React Query cache
 * (see `lib/chat-cache.ts`).
 *
 * This is deliberately separate from the tickets-based support section in the sidebar: a
 * ticket is an asynchronous, SLA-tracked case, and this is a real-time conversation. The
 * nav entry is left alone.
 *
 * The list query takes the single most recent conversation, open or closed: an open one
 * gets a composer, a closed one gets a notice and a way to start again. Fetching the
 * detail is what marks the thread read on the server, so it only runs while the panel is
 * open — an unread badge should not clear itself behind the customer's back.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useState, type RefObject } from 'react';

import { Button } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { applyChatStreamEvent } from '@/lib/chat-cache';
import { queryKeys } from '@/lib/query-keys';
import { useChatStream, type ChatSocketFactory } from '@/lib/use-chat-stream';

import { ChatPanel } from './support-chat-panel';
import { usePopover } from './use-popover';

/** Props for {@link SupportChatWidget}. */
export interface SupportChatWidgetProps {
  /** Socket factory for the stream. Injected in tests; the app uses the real default. */
  readonly createSocket?: ChatSocketFactory;
}

/** The customer's most recent conversation, open or closed, for the badge and the panel. */
function useLatestConversation() {
  return useQuery({
    queryKey: queryKeys.chat.conversations(),
    queryFn: async () => (await browserApi().chat.listConversations({ limit: 1 })).data,
  });
}

/** The full thread. Only fetched while the panel is open — fetching marks it read. */
function useOpenConversation(conversationId: string | null, open: boolean) {
  const id = conversationId ?? '';
  return useQuery({
    queryKey: queryKeys.chat.conversation(id),
    queryFn: async () => (await browserApi().chat.getConversation(id)).data,
    enabled: open && conversationId !== null,
  });
}

function fabLabel(unread: number): string {
  return unread > 0 ? `Support chat, ${unread} unread` : 'Support chat';
}

/** Props for {@link FabButton}. */
interface FabButtonProps {
  readonly ref: RefObject<HTMLButtonElement | null>;
  readonly unread: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/** The floating action button, with the unread count on it. */
function FabButton({ ref, unread, open, onToggle }: FabButtonProps) {
  return (
    <Button
      ref={ref}
      iconOnly
      size="lg"
      aria-label={fabLabel(unread)}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      className="relative rounded-full"
    >
      <MessageCircle aria-hidden="true" className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="bg-danger-solid text-on-solid ring-surface absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium ring-2"
        >
          {unread}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * The floating button and the panel it opens.
 *
 * @example <SupportChatWidget />
 */
export function SupportChatWidget({ createSocket }: SupportChatWidgetProps) {
  const { open, toggle, close, triggerRef, panelRef } = usePopover();
  const [composing, setComposing] = useState(false);
  const queryClient = useQueryClient();

  const latest = useLatestConversation().data?.[0] ?? null;
  const detail = useOpenConversation(latest?.id ?? null, open);
  const streamState = useChatStream({
    createSocket,
    onEvent: (event) => applyChatStreamEvent(queryClient, event),
  });

  return (
    <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-3 lg:right-6 lg:bottom-6">
      {open ? (
        <ChatPanel
          ref={panelRef}
          latest={latest}
          detail={detail}
          composing={composing}
          streamState={streamState}
          onStartNew={() => setComposing(true)}
          onBack={() => setComposing(false)}
          onCreated={() => setComposing(false)}
          onClose={close}
        />
      ) : null}
      <FabButton ref={triggerRef} unread={latest?.unreadCount ?? 0} open={open} onToggle={toggle} />
    </div>
  );
}
