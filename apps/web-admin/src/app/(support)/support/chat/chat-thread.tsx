/**
 * The conversation, and the reply.
 *
 * Bubbles sit on the side of the speaker — agent right, customer or guest left, the
 * bank's own systems centred and quiet — because in a fast conversation an agent reads
 * position before they read names, and an automated message that looks like a colleague
 * wrote it is how a customer ends up quoting something nobody said.
 *
 * Closing goes through a confirmation: it ends the conversation for the participant as
 * well as for the agent, and an easy misclick should not be able to do that.
 */

'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';

import { ChatAuthorType, type AdminChatConversation, type ChatMessage } from '@reliance/contracts';
import { Alert, Badge, Button, cn, Dialog, FormField, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { DialogActions } from '@/components/ops/dialog-actions';
import { formatInstant } from '@/lib/format';

import { useCloseChat, usePostChatMessage } from './use-chat';

const BUBBLE_TONE = {
  CUSTOMER: 'border-border bg-surface self-start',
  GUEST: 'border-border bg-surface self-start',
  AGENT: 'border-accent bg-accent-soft self-end',
  SYSTEM: 'border-border bg-surface-sunken self-center',
} as const;

const AUTHOR_LABEL = {
  CUSTOMER: 'Customer',
  GUEST: 'Guest',
  AGENT: 'Agent',
  SYSTEM: 'Sent automatically',
} as const;

function Message({ message }: Readonly<{ message: ChatMessage }>) {
  const automated = message.authorType === ChatAuthorType.SYSTEM;

  return (
    <li
      className={cn(
        'flex max-w-[85%] flex-col rounded-md border p-3',
        BUBBLE_TONE[message.authorType],
      )}
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-body text-fg text-sm font-medium">{message.authorName}</span>
        <Badge size="sm">{AUTHOR_LABEL[message.authorType]}</Badge>
        <span className="text-fg-subtle font-mono text-xs">{formatInstant(message.sentAt)}</span>
      </p>
      <p
        className={cn(
          'font-body mt-1 text-sm whitespace-pre-wrap',
          automated ? 'text-fg-subtle' : 'text-fg-muted',
        )}
      >
        {message.body}
      </p>
    </li>
  );
}

/** The reply draft. Chat is quick, so the one rule is that a reply says something. */
function useReplyDraft(conversationId: string) {
  const [draft, setDraft] = useState('');
  const post = usePostChatMessage();
  const empty = draft.trim().length === 0;

  return {
    draft,
    setDraft,
    post,
    empty,
    send: () => {
      if (empty) return;
      post.mutate({ conversationId, body: draft.trim() }, { onSuccess: () => setDraft('') });
    },
  };
}

interface ComposerProps {
  readonly conversationId: string;
  readonly onCloseRequest: () => void;
}

/** The reply box and the send/close controls. */
function Composer({ conversationId, onCloseRequest }: ComposerProps) {
  const { draft, empty, post, send, setDraft } = useReplyDraft(conversationId);

  return (
    <>
      {post.isError && <Alert tone="danger">{failureMessage(post.error)}</Alert>}

      <FormField label="Your reply" required hint="Sent to the participant as written.">
        <Textarea
          rows={3}
          value={draft}
          disabled={post.isPending}
          onChange={(event) => setDraft(event.target.value)}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          loading={post.isPending}
          disabled={empty}
          onClick={send}
          startIcon={<Send className="size-4" />}
        >
          Send
        </Button>
        <Button variant="secondary" disabled={post.isPending} onClick={onCloseRequest}>
          Close conversation
        </Button>
      </div>
    </>
  );
}

interface CloseDialogProps {
  readonly conversationId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The confirmation that ends the conversation for both sides. */
function CloseConversationDialog({ conversationId, open, onClose }: CloseDialogProps) {
  const close = useCloseChat();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Close this conversation"
      description="The participant is told the conversation has ended and can no longer reply. This cannot be undone from here."
      footer={
        <DialogActions
          confirmLabel="Close conversation"
          pending={close.isPending}
          onCancel={onClose}
          onConfirm={() => close.mutate(conversationId, { onSuccess: onClose })}
        />
      }
    >
      {close.isError && <Alert tone="danger">{failureMessage(close.error)}</Alert>}
    </Dialog>
  );
}

export interface ChatThreadProps {
  readonly conversation: AdminChatConversation;
}

/** The full conversation, with the composer and the close control. */
export function ChatThread({ conversation }: ChatThreadProps) {
  const [confirmingClose, setConfirmingClose] = useState(false);
  const closed = conversation.status === 'CLOSED';

  return (
    <div className="flex flex-col gap-4">
      <p className="font-body text-fg-muted text-sm">
        {conversation.assignedAgentName
          ? `Assigned to ${conversation.assignedAgentName}.`
          : 'Not yet assigned. Your reply goes out under your name.'}
      </p>

      <ol className="flex flex-col gap-2">
        {conversation.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </ol>

      {closed ? (
        <Alert tone="neutral">
          This conversation is closed. The participant can no longer reply, and neither can you.
        </Alert>
      ) : (
        <Composer
          conversationId={conversation.id}
          onCloseRequest={() => setConfirmingClose(true)}
        />
      )}

      <CloseConversationDialog
        conversationId={conversation.id}
        open={confirmingClose}
        onClose={() => setConfirmingClose(false)}
      />
    </div>
  );
}
