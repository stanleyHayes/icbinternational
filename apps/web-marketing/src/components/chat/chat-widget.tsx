'use client';

/**
 * The live support chat widget: a floating button that opens a guest conversation.
 *
 * All of the lifecycle — the stored session, the REST calls, the WebSocket — lives in
 * `useGuestChat`; this component is the button and the panel frame. It renders on every
 * page via the root layout, so it stays quiet until asked: no requests fire before the
 * visitor opens it.
 */

import { MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { Alert, CloseIcon, cn, FOCUS_RING, Spinner } from '@reliance/ui';

import { useGuestChat, type CreateChatSocket, type GuestChat } from '@/lib/chat/use-guest-chat';

import { ConversationPanel } from './conversation-panel';
import { PreChatPanel } from './pre-chat-panel';

function ChatFab({
  open,
  unreadCount,
  onToggle,
}: {
  readonly open: boolean;
  readonly unreadCount: number;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={open ? 'Close chat' : 'Chat with us'}
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        'bg-accent text-accent-fg hover:bg-accent-hover fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg',
        FOCUS_RING,
      )}
    >
      {open ? (
        <CloseIcon width={24} height={24} />
      ) : (
        <MessageCircle size={24} aria-hidden="true" />
      )}
      {!open && unreadCount > 0 && (
        <span
          role="status"
          aria-label={`${unreadCount} unread messages`}
          className="bg-danger-solid text-on-solid absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold"
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}

function PanelBody({ chat }: { readonly chat: GuestChat }) {
  if (chat.phase === 'active' && !chat.conversation) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Spinner label="Loading your conversation" />
      </div>
    );
  }
  if (chat.phase === 'active' && chat.conversation) {
    return (
      <ConversationPanel
        conversation={chat.conversation}
        sending={chat.sending}
        onSend={chat.sendMessage}
        onStartNew={chat.startNewChat}
      />
    );
  }
  return <PreChatPanel starting={chat.starting} onStart={chat.startConversation} />;
}

function ChatPanel({ chat }: { readonly chat: GuestChat }) {
  return (
    <section
      aria-label="Support chat"
      className={cn(
        'border-border bg-surface-raised fixed right-5 bottom-24 z-50 flex max-h-[min(36rem,calc(100dvh-8rem))] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg border shadow-lg',
        'motion-safe:animate-slide-up',
      )}
    >
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-fg font-display font-semibold">Chat with us</h2>
      </header>

      {chat.error && (
        <div className="p-4 pb-0">
          <Alert tone="danger">{chat.error}</Alert>
        </div>
      )}

      <PanelBody chat={chat} />
    </section>
  );
}

/**
 * The widget itself: a floating action button, an unread badge, and the panel.
 *
 * The badge counts messages that arrived while the panel was closed; opening the panel is
 * what marks them seen.
 */
export function ChatWidget({ createSocket }: { readonly createSocket?: CreateChatSocket }) {
  const [open, setOpen] = useState(false);
  const chat = useGuestChat({ open, ...(createSocket ? { createSocket } : {}) });
  const toggle = () => setOpen((current) => !current);

  return (
    <>
      <ChatFab open={open} unreadCount={chat.unreadCount} onToggle={toggle} />
      {open && <ChatPanel chat={chat} />}
    </>
  );
}
