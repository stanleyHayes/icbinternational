'use client';

/**
 * The conversation thread: the message list, the composer, and the closed notice.
 *
 * An ordered list, oldest first, with each message naming who wrote it — alignment alone
 * is not information a screen reader can use. The customer's messages sit right, the
 * agent's and system's left with their name and the time.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { ApiClientError } from '@reliance/api-client';
import {
  ChatAuthorType,
  ChatConversationStatus,
  ErrorCode,
  type ChatConversation,
  type ChatMessage,
} from '@reliance/contracts';
import { Button, cn, Textarea } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { appendToCachedConversation, markConversationClosed } from '@/lib/chat-cache';
import { formatDateTime } from '@/lib/format';

import { FormAlert, FormNotice } from './form-alert';

const BODY_MAX = 2000;

/** Who wrote a message, in words rather than by alignment alone. */
function authorLabel(message: ChatMessage): string {
  return message.authorType === ChatAuthorType.CUSTOMER ? 'You' : message.authorName;
}

function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const fromCustomer = message.authorType === ChatAuthorType.CUSTOMER;

  return (
    <li className={cn('flex', fromCustomer ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          fromCustomer ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg',
        )}
      >
        <p className={cn('text-xs font-medium', fromCustomer ? 'opacity-80' : 'text-fg-muted')}>
          {authorLabel(message)} · {formatDateTime(message.sentAt)}
        </p>
        <p className="mt-1 text-sm break-words whitespace-pre-wrap">{message.body}</p>
      </div>
    </li>
  );
}

/** Sends over REST and records the result; the stream echo is deduplicated on arrival. */
function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) =>
      (await browserApi().chat.postMessage(conversationId, { body })).data,
    onSuccess: (message) => appendToCachedConversation(queryClient, conversationId, message),
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.is(ErrorCode.CONFLICT)) {
        markConversationClosed(queryClient, conversationId);
      }
    },
  });
}

/** The reply box. Enter sends; Shift+Enter keeps the newline a longer message needs. */
function Composer({ conversationId }: { readonly conversationId: string }) {
  const [body, setBody] = useState('');
  const send = useSendMessage(conversationId);

  const submit = (): void => {
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setBody('') });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="border-border flex flex-col gap-2 border-t p-3">
      <FormAlert error={send.error} />
      <Textarea
        value={body}
        rows={3}
        maxLength={BODY_MAX}
        aria-label="Message"
        placeholder="Write a message"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!body.trim()} loading={send.isPending}>
          Send
        </Button>
      </div>
    </form>
  );
}

/** What sits under a closed thread, in place of the composer. */
function ClosedNotice({ onStartNew }: { readonly onStartNew: () => void }) {
  return (
    <div className="border-border flex flex-col gap-3 border-t p-3">
      <FormNotice title="This conversation is closed" live>
        Start a new chat and we will pick things up from here.
      </FormNotice>
      <Button size="sm" fullWidth onClick={onStartNew}>
        Start a new chat
      </Button>
    </div>
  );
}

/** Props for {@link ThreadView}. */
export interface ThreadViewProps {
  readonly conversation: ChatConversation;
  readonly onStartNew: () => void;
}

/** One conversation, oldest first, with the composer — or the closed notice — at the end. */
export function ThreadView({ conversation, onStartNew }: ThreadViewProps) {
  const closed = conversation.status === ChatConversationStatus.CLOSED;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageCount = conversation.messages.length;

  // Keep the newest message in view. Scroll position is the customer's while they read
  // back up the thread, so this follows the conversation growing, not every render.
  useEffect(() => {
    const region = scrollRef.current;
    if (region) region.scrollTop = region.scrollHeight;
  }, [messageCount]);

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ol aria-label="Messages" className="flex flex-col gap-2 p-3">
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ol>
      </div>
      {closed ? (
        <ClosedNotice onStartNew={onStartNew} />
      ) : (
        <Composer conversationId={conversation.id} />
      )}
    </>
  );
}
