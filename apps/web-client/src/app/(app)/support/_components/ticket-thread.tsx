'use client';

/**
 * One conversation.
 *
 * An ordered list, oldest first, with each message naming who wrote it. The reply box sits at the
 * bottom where the conversation ends, and the whole thread stays on screen while it is being
 * written — nobody should have to leave a reply to re-read what they are replying to.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Ticket, TicketMessage } from '@reliance/contracts';
import { Button, cn, StatusPill, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import { TICKET_STATUS } from './support-look';

const BODY_MAX = 5000;

/** Props for {@link TicketThread}. */
export interface TicketThreadProps {
  readonly ticketId: string;
}

/** Who wrote a message, in words rather than by alignment alone. */
function authorLabel(message: TicketMessage): string {
  if (message.authorType === 'CUSTOMER') return 'You';
  if (message.authorType === 'AGENT') return message.authorName;
  return 'Reliance Bank';
}

function Message({ message }: { readonly message: TicketMessage }) {
  const fromUs = message.authorType !== 'CUSTOMER';

  return (
    <li
      className={cn(
        'border-border rounded-lg border p-4',
        fromUs ? 'bg-surface-sunken' : 'bg-surface',
      )}
    >
      <p className="text-fg-muted text-xs font-medium">
        {authorLabel(message)} · {formatDateTime(message.sentAt)}
      </p>
      <p className="text-fg mt-2 text-sm whitespace-pre-wrap">{message.body}</p>
      {message.attachmentIds.length > 0 ? (
        <p className="text-fg-subtle mt-2 text-xs">
          {message.attachmentIds.length} attachment
          {message.attachmentIds.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </li>
  );
}

/** Posts a reply and refreshes the thread it belongs to. */
function useReply(ticketId: string) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) =>
      (await browserApi().support.postMessage(ticketId, { body })).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.support.all });
    },
  });
}

/** The reply box, at the end of the conversation where the conversation ends. */
function ReplyBox({ ticketId }: { readonly ticketId: string }) {
  const [body, setBody] = useState('');
  const reply = useReply(ticketId);

  const send = (): void => {
    if (!body.trim()) return;
    reply.mutate(body.trim(), { onSuccess: () => setBody('') });
  };

  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4">
      <FormAlert error={reply.error} />
      <Textarea
        value={body}
        maxLength={BODY_MAX}
        aria-label="Your reply"
        placeholder="Write your reply"
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex justify-end">
        <Button disabled={!body.trim()} loading={reply.isPending} onClick={send}>
          Send reply
        </Button>
      </div>
    </div>
  );
}

function ThreadBody({ ticket }: { readonly ticket: Ticket }) {
  const status = TICKET_STATUS[ticket.status];

  return (
    <Section
      title={ticket.subject}
      description={
        ticket.assignedAgentName ? `Looked after by ${ticket.assignedAgentName}` : undefined
      }
      action={<StatusPill tone={status.tone} label={status.label} />}
    >
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3">
          {ticket.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </ol>
        <ReplyBox ticketId={ticket.id} />
      </div>
    </Section>
  );
}

/**
 * @example <TicketThread ticketId={ticketId} />
 */
export function TicketThread({ ticketId }: TicketThreadProps) {
  const ticket = useQuery({
    queryKey: movementKeys.support.ticket(ticketId),
    queryFn: async () => (await browserApi().support.getTicket(ticketId)).data,
  });

  return (
    <QueryPanel query={ticket} skeletonRows={3}>
      {(data) => <ThreadBody ticket={data} />}
    </QueryPanel>
  );
}
