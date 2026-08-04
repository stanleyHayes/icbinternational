/**
 * What this customer has asked us, and what they are disputing.
 *
 * Both lists are scoped by the record's own fields — a dispute by the posting it names,
 * a ticket by the customer who wrote the first message on it, which is the only
 * identifier a ticket carries. The scoping is stated on screen rather than assumed,
 * because an agent who believes they are seeing everything will close a call on the
 * strength of an empty list.
 */

'use client';

import Link from 'next/link';

import type { Dispute, Ticket } from '@reliance/contracts';
import { cn, EmptyState, FOCUS_RING, MoneyText, StatusPill } from '@reliance/ui';

import {
  disputeTone,
  priorityTone,
  QueueError,
  QueueLoading,
  ScreenPanel,
  SlaCell,
  ticketTone,
  useConsoleNow,
} from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { href } from '@/lib/routes';

import { useCustomerContacts } from '../data/use-customer-risk';

const LINK = 'font-body text-sm text-accent underline-offset-2 hover:underline';
const ROW =
  'flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0';

interface TicketListProps {
  readonly tickets: readonly Ticket[];
  readonly nowMs: number;
}

function TicketList({ tickets, nowMs }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No correspondence from this customer"
        description="Tickets are matched by the name on the customer's first message, so a ticket raised under a different name will not appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {tickets.map((ticket) => (
        <li key={ticket.id} className={ROW}>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusPill tone={ticketTone(ticket.status)} label={humaniseCode(ticket.status)} />
            <StatusPill
              tone={priorityTone(ticket.priority)}
              label={`${humaniseCode(ticket.priority)} priority`}
            />
            <span className="font-body text-fg text-sm">{ticket.subject}</span>
          </span>
          <span className="flex items-center gap-3">
            <SlaCell dueAt={ticket.slaDueAt} nowMs={nowMs} settled={ticket.resolvedAt !== null} />
            <Link href={href('/support/tickets')} className={cn(LINK, FOCUS_RING)}>
              Open in support
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface DisputeListProps {
  readonly disputes: readonly Dispute[];
  readonly nowMs: number;
}

function DisputeList({ disputes, nowMs }: DisputeListProps) {
  if (disputes.length === 0) {
    return (
      <EmptyState
        title="Nothing disputed"
        description="This customer has not challenged any of the postings on their accounts."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {disputes.map((dispute) => (
        <li key={dispute.id} className={ROW}>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusPill tone={disputeTone(dispute.status)} label={humaniseCode(dispute.status)} />
            <span className="font-body text-fg text-sm">{humaniseCode(dispute.reason)}</span>
            <MoneyText
              amount={dispute.disputedAmount.amount}
              currency={dispute.disputedAmount.currency}
              muted
            />
            <span className="text-fg-subtle font-mono text-xs">
              raised {formatInstant(dispute.createdAt)}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <SlaCell
              dueAt={dispute.decisionDueAt}
              nowMs={nowMs}
              settled={dispute.resolvedAt !== null}
            />
            <Link href={href('/disputes')} className={cn(LINK, FOCUS_RING)}>
              Open the dispute
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface SupportTabProps {
  readonly customerId: string;
  readonly customerName: string;
  readonly transactionIds: readonly string[];
}

/** Tickets raised by this customer and disputes against their postings. */
export function SupportTab(props: SupportTabProps) {
  const contacts = useCustomerContacts(props.customerId, props.customerName, props.transactionIds);
  const nowMs = useConsoleNow();

  if (contacts.isLoading) return <QueueLoading label="correspondence" />;
  if (contacts.isError) {
    return (
      <QueueError
        error={contacts.error}
        subject="this customer's correspondence"
        onRetry={contacts.refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenPanel title="Support tickets">
        <TicketList tickets={contacts.data?.tickets ?? []} nowMs={nowMs} />
      </ScreenPanel>
      <ScreenPanel title="Disputes">
        <DisputeList disputes={contacts.data?.disputes ?? []} nowMs={nowMs} />
      </ScreenPanel>
    </div>
  );
}
