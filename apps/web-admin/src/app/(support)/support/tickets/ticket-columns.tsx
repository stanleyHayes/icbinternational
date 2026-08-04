/**
 * The columns of the support queue.
 *
 * "Waiting on" is derived rather than shown raw, because `AWAITING_CUSTOMER` and
 * `AWAITING_AGENT` read almost identically at a glance and mean opposite things to an
 * agent choosing what to pick up. One says "you", the other says "them".
 */

'use client';

import type { Ticket, TicketMessage } from '@reliance/contracts';
import { Badge, StatusPill } from '@reliance/ui';

import {
  openColumn,
  priorityTone,
  SlaCell,
  slaSortValue,
  slaText,
  ticketTone,
} from '@/components/compliance/kit';
import { ticketRaisedBy } from '@/components/customers/data/use-customer-risk';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

/** Whose move it is, said as an agent would say it. */
export function waitingOn(ticket: Ticket): string {
  if (ticket.status === 'AWAITING_CUSTOMER') return 'The customer';
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return 'Nobody — finished';
  return 'Us';
}

/** The last thing said on the thread, whoever said it. */
export function lastMessage(ticket: Ticket): TicketMessage | undefined {
  return ticket.messages.at(-1);
}

const CONVERSATION_COLUMNS: readonly DataColumn<Ticket>[] = [
  {
    id: 'subject',
    header: 'Ticket',
    alwaysVisible: true,
    cell: (ticket) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">{ticket.subject}</span>
        <span className="font-body text-fg-muted text-xs">
          {ticketRaisedBy(ticket) ?? 'Raised in the app'}
        </span>
      </span>
    ),
    csv: (ticket) => ticket.subject,
  },
  {
    id: 'status',
    header: 'State',
    cell: (ticket) => (
      <StatusPill tone={ticketTone(ticket.status)} label={humaniseCode(ticket.status)} />
    ),
    csv: (ticket) => humaniseCode(ticket.status),
  },
  {
    id: 'waiting',
    header: 'Waiting on',
    cell: (ticket) => <span className="font-body text-fg text-sm">{waitingOn(ticket)}</span>,
    csv: (ticket) => waitingOn(ticket),
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (ticket) => (
      <Badge tone={priorityTone(ticket.priority)}>{humaniseCode(ticket.priority)}</Badge>
    ),
    csv: (ticket) => humaniseCode(ticket.priority),
  },
];

const HANDLING_COLUMNS: readonly DataColumn<Ticket>[] = [
  {
    id: 'topic',
    header: 'Topic',
    cell: (ticket) => <Badge>{humaniseCode(ticket.topic)}</Badge>,
    csv: (ticket) => humaniseCode(ticket.topic),
  },
  {
    id: 'agent',
    header: 'Agent',
    cell: (ticket) => (
      <span className="font-body text-fg-muted text-sm">
        {ticket.assignedAgentName ?? 'Unassigned'}
      </span>
    ),
    csv: (ticket) => ticket.assignedAgentName ?? 'Unassigned',
  },
  {
    id: 'lastReply',
    header: 'Last message',
    cell: (ticket) => (
      <span className="text-fg-muted font-mono text-xs">
        {formatInstant(lastMessage(ticket)?.sentAt ?? ticket.updatedAt)}
      </span>
    ),
    csv: (ticket) => formatInstant(lastMessage(ticket)?.sentAt ?? ticket.updatedAt),
    sortValue: (ticket) => lastMessage(ticket)?.sentAt ?? ticket.updatedAt,
  },
  {
    id: 'csat',
    header: 'Rating',
    align: 'end',
    cell: (ticket) => (
      <span className="text-fg-muted font-mono text-sm tabular-nums">
        {ticket.satisfactionRating === null ? '—' : `${ticket.satisfactionRating}/5`}
      </span>
    ),
    csv: (ticket) => (ticket.satisfactionRating === null ? '' : String(ticket.satisfactionRating)),
    sortValue: (ticket) => ticket.satisfactionRating ?? 0,
  },
];

/** Columns for the support queue, measured against the given instant. */
export function ticketColumns(
  nowMs: number,
  openId: string | null,
  onOpen: (ticketId: string) => void,
): readonly DataColumn<Ticket>[] {
  const sla: DataColumn<Ticket> = {
    id: 'sla',
    header: 'Reply due',
    cell: (ticket) => (
      <SlaCell dueAt={ticket.slaDueAt} nowMs={nowMs} settled={ticket.resolvedAt !== null} />
    ),
    csv: (ticket) => slaText(ticket.slaDueAt, nowMs),
    sortValue: (ticket) => slaSortValue(ticket.slaDueAt),
  };

  return [
    ...CONVERSATION_COLUMNS,
    sla,
    ...HANDLING_COLUMNS,
    openColumn<Ticket>({ header: 'Thread', idOf: (ticket) => ticket.id, openId, onOpen }),
  ];
}
