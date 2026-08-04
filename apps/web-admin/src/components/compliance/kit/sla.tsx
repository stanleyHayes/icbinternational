/**
 * The clock a regulator will ask about.
 *
 * Identity review, monitoring alerts, disputes and tickets all commit the bank to a
 * deadline, and all four are breached the same way: quietly, by an item that stopped
 * being the most urgent thing on screen. So the cell states the time remaining in words,
 * marks a breach as a breach rather than as a colour, and carries the exact deadline in
 * its `title` for the operator who needs to quote it.
 *
 * Nothing here reads the clock. `now` is passed in from `useConsoleNow`, so every SLA on
 * a screen agrees and a test can pin them all.
 */

'use client';

import { AlertTriangle, Clock } from 'lucide-react';

import { cn } from '@reliance/ui';

import { formatElapsed, formatInstant, isOverdue } from '@/lib/format';

/** Inside this window the item is close enough to breach to be worth flagging: one hour. */
const AT_RISK_MS = 3_600_000;

const BASE = 'inline-flex items-center gap-1.5 whitespace-nowrap font-body text-sm tabular-nums';

export interface SlaCellProps {
  /** The deadline the bank has committed to, or `null` when the item has none. */
  readonly dueAt: string | null;
  /** The current instant in epoch milliseconds, from `useConsoleNow`. */
  readonly nowMs: number;
  /** Set once the item is finished: the clock stops and the cell reads as history. */
  readonly settled?: boolean;
}

/** How long is left, whether that is a problem, and the exact deadline on hover. */
export function SlaCell({ dueAt, nowMs, settled }: SlaCellProps) {
  if (!dueAt) return <span className="font-body text-fg-subtle text-sm">No deadline set</span>;

  const exact = formatInstant(dueAt);

  if (settled) {
    return (
      <span className={cn(BASE, 'text-fg-muted')} title={exact}>
        Met
      </span>
    );
  }

  const breached = isOverdue(dueAt, nowMs);
  const atRisk = !breached && new Date(dueAt).getTime() - nowMs < AT_RISK_MS;
  const gap = formatElapsed(dueAt, nowMs);
  const Icon = breached ? AlertTriangle : Clock;

  return (
    <span
      className={cn(BASE, breached && 'text-danger font-medium', atRisk && 'text-warning')}
      title={exact}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {breached ? `Overdue by ${gap.replace(' ago', '')}` : `${gap.replace('in ', '')} left`}
    </span>
  );
}

/**
 * The SLA as plain text, for an export and for the column's sort key.
 *
 * Sorting on this string would order alphabetically, which is meaningless for a
 * duration, so queues sort on `slaSortValue` and export this.
 */
export function slaText(dueAt: string | null, nowMs: number): string {
  if (!dueAt) return 'No deadline set';
  return isOverdue(dueAt, nowMs) ? `Overdue (due ${formatInstant(dueAt)})` : formatInstant(dueAt);
}

export { countBreached, slaSortValue } from './sla-order';
