/**
 * The conversation, and the reply.
 *
 * Messages are attributed by role as well as by name — customer, agent, or the bank's own
 * systems — because an automated message that reads like an agent wrote it is how a
 * customer ends up quoting something no colleague ever said.
 *
 * Choosing a canned response fills the box and leaves the cursor in it. It is a starting
 * point, never a send: an agent who cannot edit the reply will send the wrong one.
 */

'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';

import type { Ticket, TicketMessage } from '@reliance/contracts';
import { Alert, Badge, Button, cn, FormField, Select, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';

import { CANNED_RESPONSES } from './canned-responses';
import { useUpdateTicket } from './use-tickets';

/** A reply shorter than this is not an answer. */
const MIN_REPLY_LENGTH = 15;

const TOO_SHORT = `Write at least ${MIN_REPLY_LENGTH} characters. The customer reads this.`;

const AUTHOR_TONE = {
  CUSTOMER: 'border-border bg-surface',
  AGENT: 'border-accent bg-accent-soft',
  SYSTEM: 'border-border bg-surface-sunken',
} as const;

const AUTHOR_LABEL = {
  CUSTOMER: 'Customer',
  AGENT: 'Agent',
  SYSTEM: 'Sent automatically',
} as const;

function Message({ message }: Readonly<{ message: TicketMessage }>) {
  return (
    <li className={cn('rounded-md border p-3', AUTHOR_TONE[message.authorType])}>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-body text-fg text-sm font-medium">{message.authorName}</span>
        <Badge size="sm">{AUTHOR_LABEL[message.authorType]}</Badge>
        <span className="text-fg-subtle font-mono text-xs">{formatInstant(message.sentAt)}</span>
      </p>
      <p className="font-body text-fg-muted mt-1 text-sm whitespace-pre-wrap">{message.body}</p>
      {message.attachmentIds.length > 0 && (
        <p className="font-body text-fg-subtle mt-1 text-xs">
          {message.attachmentIds.length} attachment
          {message.attachmentIds.length === 1 ? '' : 's'}
        </p>
      )}
    </li>
  );
}

export interface TicketThreadProps {
  readonly ticket: Ticket;
}

/** The reply draft and the one rule it has to satisfy. */
function useReplyDraft(ticket: Ticket) {
  const [draft, setDraft] = useState('');
  const [attempted, setAttempted] = useState(false);
  const update = useUpdateTicket();
  const tooShort = draft.trim().length < MIN_REPLY_LENGTH;

  return {
    draft,
    setDraft,
    update,
    tooShort,
    attempted,
    send: () => {
      setAttempted(true);
      if (tooShort) return;
      update.mutate(
        { ticketId: ticket.id, reply: draft.trim(), status: 'AWAITING_CUSTOMER' },
        {
          onSuccess: () => {
            setDraft('');
            setAttempted(false);
          },
        },
      );
    },
  };
}

/** The full conversation on a ticket, with the reply composer. */
export function TicketThread({ ticket }: TicketThreadProps) {
  const { attempted, draft, send, setDraft, tooShort, update } = useReplyDraft(ticket);
  const finished = ticket.status === 'CLOSED';

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {ticket.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </ol>

      {finished ? (
        <Alert tone="neutral">
          This conversation is closed. Reopen it from the ticket controls to reply again.
        </Alert>
      ) : (
        <Composer
          draft={draft}
          statusLabel={humaniseCode(ticket.status).toLowerCase()}
          error={update.isError ? failureMessage(update.error) : null}
          fieldError={attempted && tooShort ? TOO_SHORT : null}
          isSending={update.isPending}
          onDraftChange={setDraft}
          onSend={send}
          onResolve={() =>
            update.mutate({ ticketId: ticket.id, reply: draft.trim(), status: 'RESOLVED' })
          }
        />
      )}
    </div>
  );
}

const REPLY_HINT = 'Sent to the customer as written, from the bank.';

/** Tall enough that an agent can see a whole reply without scrolling. */
const REPLY_ROWS = 8;

const SAVED_REPLY_OPTIONS = CANNED_RESPONSES.map((response) => ({
  value: response.id,
  label: `${response.topic} — ${response.label}`,
}));

interface ComposerProps {
  readonly draft: string;
  readonly statusLabel: string;
  readonly error: string | null;
  readonly fieldError: string | null;
  readonly isSending: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onSend: () => void;
  readonly onResolve: () => void;
}

function Composer(props: ComposerProps) {
  const choose = (id: string): void => {
    const chosen = CANNED_RESPONSES.find((response) => response.id === id);
    if (chosen) props.onDraftChange(chosen.body);
  };

  return (
    <div className="flex flex-col gap-2">
      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <FormField label="Start from a saved reply">
        <Select
          value=""
          placeholder="Choose a saved reply"
          options={SAVED_REPLY_OPTIONS}
          onChange={(event) => choose(event.target.value)}
        />
      </FormField>

      <FormField label="Your reply" required hint={REPLY_HINT} error={props.fieldError}>
        <Textarea
          rows={REPLY_ROWS}
          value={props.draft}
          disabled={props.isSending}
          onChange={(event) => props.onDraftChange(event.target.value)}
        />
      </FormField>

      <SendRow
        isSending={props.isSending}
        statusLabel={props.statusLabel}
        onSend={props.onSend}
        onResolve={props.onResolve}
      />
    </div>
  );
}

interface SendRowProps {
  readonly isSending: boolean;
  readonly statusLabel: string;
  readonly onSend: () => void;
  readonly onResolve: () => void;
}

function SendRow(props: SendRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        loading={props.isSending}
        onClick={props.onSend}
        startIcon={<Send className="size-4" />}
      >
        Send the reply
      </Button>
      <Button variant="secondary" disabled={props.isSending} onClick={props.onResolve}>
        Send and mark resolved
      </Button>
      <span className="font-body text-fg-muted text-xs">Currently {props.statusLabel}.</span>
    </div>
  );
}
