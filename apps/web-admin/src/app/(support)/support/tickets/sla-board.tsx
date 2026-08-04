/**
 * The board a team lead stands in front of.
 *
 * Tickets bucketed by how close they are to the reply commitment, not by status. A status
 * board tells you what people are doing; an SLA board tells you what is about to go wrong,
 * which is the only thing worth reallocating an agent for.
 *
 * The buckets are deliberately coarse. Five columns of counts can be read across a room;
 * a precise histogram cannot.
 */

'use client';

import type { Ticket } from '@reliance/contracts';

import { MetricRow, MetricTile } from '@/components/compliance/kit';
import { formatCount } from '@/lib/format';

const MS_PER_HOUR = 3_600_000;

/** Inside this many hours of the deadline, a ticket is worth pulling forward. */
const AT_RISK_HOURS = 2;

/** How a ticket stands against its reply commitment. */
export interface SlaBuckets {
  readonly breached: readonly Ticket[];
  readonly atRisk: readonly Ticket[];
  readonly inTime: readonly Ticket[];
  readonly unassigned: readonly Ticket[];
  readonly withCustomer: readonly Ticket[];
}

/** True when the bank still owes this customer a reply. */
function isOurs(ticket: Ticket): boolean {
  return ticket.resolvedAt === null && ticket.status !== 'AWAITING_CUSTOMER';
}

/** Sorts the queue into the buckets the board shows. */
export function bucketBySla(tickets: readonly Ticket[], nowMs: number): SlaBuckets {
  const ours = tickets.filter(isOurs);
  const remaining = (ticket: Ticket) =>
    ticket.slaDueAt === null
      ? Number.POSITIVE_INFINITY
      : new Date(ticket.slaDueAt).getTime() - nowMs;

  return {
    breached: ours.filter((ticket) => remaining(ticket) < 0),
    atRisk: ours.filter((ticket) => {
      const left = remaining(ticket);
      return left >= 0 && left < AT_RISK_HOURS * MS_PER_HOUR;
    }),
    inTime: ours.filter((ticket) => remaining(ticket) >= AT_RISK_HOURS * MS_PER_HOUR),
    unassigned: ours.filter((ticket) => ticket.assignedAgentName === null),
    withCustomer: tickets.filter(
      (ticket) => ticket.resolvedAt === null && ticket.status === 'AWAITING_CUSTOMER',
    ),
  };
}

export interface SlaBoardProps {
  readonly tickets: readonly Ticket[];
  readonly nowMs: number;
}

/** Counts of where the queue stands against the reply commitment. */
export function SlaBoard({ tickets, nowMs }: SlaBoardProps) {
  const buckets = bucketBySla(tickets, nowMs);

  return (
    <MetricRow>
      <MetricTile
        label="Past the reply time"
        value={formatCount(buckets.breached.length)}
        detail={
          buckets.breached.length === 0
            ? 'Nothing has missed its reply time'
            : 'Answer these before anything else'
        }
        urgent={buckets.breached.length > 0}
      />
      <MetricTile
        label="Due within two hours"
        value={formatCount(buckets.atRisk.length)}
        detail="Pull these forward"
        urgent={buckets.atRisk.length > 0}
      />
      <MetricTile
        label="Nobody assigned"
        value={formatCount(buckets.unassigned.length)}
        detail={buckets.unassigned.length === 0 ? 'Every ticket has an agent' : 'Needs an owner'}
        urgent={buckets.unassigned.length > 0}
      />
      <MetricTile
        label="Waiting on the customer"
        value={formatCount(buckets.withCustomer.length)}
        detail="Not ours to move"
      />
    </MetricRow>
  );
}

/** Average satisfaction across the tickets that were rated, to one decimal place. */
export function averageSatisfaction(tickets: readonly Ticket[]): string {
  const rated = tickets.filter((ticket) => ticket.satisfactionRating !== null);
  if (rated.length === 0) return 'Not yet rated';

  const DECIMALS = 1;
  const total = rated.reduce((sum, ticket) => sum + (ticket.satisfactionRating ?? 0), 0);
  return `${(total / rated.length).toFixed(DECIMALS)} out of 5`;
}
