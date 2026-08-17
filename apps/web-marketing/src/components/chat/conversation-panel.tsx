'use client';

/**
 * The open thread: message list, composer, and the closed-conversation notice.
 *
 * The guest's own messages sit on the right, everyone else's on the left — the convention
 * every messaging surface follows, so a visitor already knows how to read it.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  ChatAuthorType,
  ChatConversationStatus,
  type ChatConversation,
  type ChatMessage,
} from '@reliance/contracts';
import { Alert, Button, cn, FormField, Textarea } from '@reliance/ui';

const MESSAGE_TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function formatSentAt(sentAt: string): string {
  const parsed = Date.parse(sentAt);
  return Number.isNaN(parsed) ? '' : MESSAGE_TIME.format(new Date(parsed));
}

function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const own = message.authorType === ChatAuthorType.GUEST;
  return (
    <li className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}>
      <p className="text-fg-muted text-xs">
        {message.authorName} · {formatSentAt(message.sentAt)}
      </p>
      <p
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
          own ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg',
        )}
      >
        {message.body}
      </p>
    </li>
  );
}

function MessageList({ messages }: { readonly messages: readonly ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. jsdom has no scrollIntoView, so the call is optional.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  return (
    <ul
      aria-label="Conversation"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </ul>
  );
}

function Composer({
  sending,
  onSend,
}: {
  readonly sending: boolean;
  readonly onSend: (body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    void onSend(body).then((sent) => {
      if (sent) setDraft('');
    });
  };

  return (
    <form className="border-border flex items-end gap-2 border-t p-4" onSubmit={submit}>
      <div className="flex-1">
        <FormField label="Your reply" className="[&>label]:sr-only">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Write a message…"
          />
        </FormField>
      </div>
      <Button type="submit" variant="primary" loading={sending}>
        Send
      </Button>
    </form>
  );
}

function ClosedNotice({ onStartNew }: { readonly onStartNew: () => void }) {
  return (
    <div className="border-border flex flex-col gap-3 border-t p-4">
      <Alert tone="info" title="This conversation has ended">
        Start a new chat and we will pick things up from here.
      </Alert>
      <Button variant="secondary" onClick={onStartNew} fullWidth>
        Start a new chat
      </Button>
    </div>
  );
}

export function ConversationPanel({
  conversation,
  sending,
  onSend,
  onStartNew,
}: {
  readonly conversation: ChatConversation;
  readonly sending: boolean;
  readonly onSend: (body: string) => Promise<boolean>;
  readonly onStartNew: () => void;
}) {
  const closed = conversation.status === ChatConversationStatus.CLOSED;
  return (
    <>
      <MessageList messages={conversation.messages} />
      {closed ? <ClosedNotice onStartNew={onStartNew} /> : <Composer sending={sending} onSend={onSend} />}
    </>
  );
}
