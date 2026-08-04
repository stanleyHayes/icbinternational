'use client';

/**
 * The customer's conversations with us.
 *
 * "We are waiting for you" is the status that matters, so it is carried in words as well as tone.
 * A ticket that has been waiting on the customer for a week is a ticket nobody is going to answer,
 * and the list is the only place to say so.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { Ticket } from '@reliance/contracts';
import { Badge, cn, StatusPill } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { relativeTime } from '@/lib/format';

import { TICKET_STATUS, TOPIC_LABEL } from './support-look';

const NEW_TICKET = <LinkButton href={laneRoutes.support.newTicket}>Message us</LinkButton>;

const NO_TICKETS = (
  <EmptyPanel
    title="No messages yet"
    description="Message us about anything at all. We answer in the app, and everything you send stays here so you never have to explain it twice."
    action={NEW_TICKET}
  />
);

function TicketRow({ ticket }: { readonly ticket: Ticket }) {
  const status = TICKET_STATUS[ticket.status];

  return (
    <li>
      <Link
        href={laneRoutes.support.ticket(ticket.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">{ticket.subject}</span>
          <span className="text-fg-muted mt-0.5 block text-xs">
            {TOPIC_LABEL[ticket.topic]} · updated {relativeTime(ticket.updatedAt)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {ticket.unreadCount > 0 ? <Badge tone="accent">{ticket.unreadCount} new</Badge> : null}
          <StatusPill tone={status.tone} label={status.label} />
        </span>
      </Link>
    </li>
  );
}

/**
 * @example <TicketsPanel />
 */
export function TicketsPanel() {
  const filters = {};
  const tickets = useQuery({
    queryKey: movementKeys.support.tickets(filters),
    queryFn: async () => (await browserApi().support.listTickets()).data,
  });

  return (
    <Section title="Your messages" description="Everything you have asked us." action={NEW_TICKET}>
      <QueryPanel
        query={tickets}
        skeletonRows={3}
        isEmpty={(list) => list.length === 0}
        empty={NO_TICKETS}
      >
        {(list) => (
          <ul className="divide-border -mx-3 flex flex-col divide-y">
            {list.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
