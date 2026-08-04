/**
 * The audit trail.
 *
 * Used two ways: as the platform-wide explorer, and as the history panel on a single
 * record. Both need the same thing — a legible sequence of who changed what — so both
 * get the same component rather than two that drift.
 *
 * The chain state is stated at the top whether or not it is broken. A control that only
 * appears when something is wrong is a control nobody trusts, because its silence is
 * indistinguishable from its absence.
 */

'use client';

import type { AuditEvent } from '@reliance/contracts';
import { Alert, EmptyState, Skeleton } from '@reliance/ui';

import { brokenLinks } from './audit-chain';
import { AuditEventRow } from './audit-event-row';

/** Placeholder rows shown while the page is being fetched. */
const SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'] as const;

export interface AuditTrailProps {
  readonly events: readonly AuditEvent[];
  readonly isLoading?: boolean;
  /** What these events belong to, e.g. "this customer". Used in the empty state. */
  readonly subject?: string;
  /** Hides the chain summary where the surrounding screen already states it. */
  readonly hideChainSummary?: boolean;
}

function ChainSummary({ brokenCount }: Readonly<{ brokenCount: number }>) {
  if (brokenCount > 0) {
    return (
      <Alert tone="danger" title="This history has been altered">
        {brokenCount === 1
          ? 'One event does not match the record before it.'
          : `${brokenCount} events do not match the record before them.`}{' '}
        Raise this with the security desk before acting on anything below.
      </Alert>
    );
  }

  return (
    <Alert tone="success" title="History verified">
      Every event on this page links correctly to the one before it.
    </Alert>
  );
}

function LoadingRows() {
  return (
    <ul aria-hidden="true" className="flex flex-col">
      {SKELETON_ROWS.map((row) => (
        <li key={row} className="border-border border-b px-3 py-3 last:border-0">
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

/** A chronological, tamper-evident list of changes. */
export function AuditTrail({ events, isLoading, subject, hideChainSummary }: AuditTrailProps) {
  if (isLoading) return <LoadingRows />;

  if (events.length === 0) {
    return (
      <EmptyState
        title="Nothing has been recorded yet"
        description={`No changes have been made to ${subject ?? 'this record'}.`}
      />
    );
  }

  const broken = brokenLinks(events);

  return (
    <div className="flex flex-col gap-3">
      {!hideChainSummary && <ChainSummary brokenCount={broken.size} />}
      <ul className="border-border flex flex-col rounded-md border">
        {events.map((event) => (
          <AuditEventRow key={event.id} event={event} broken={broken.has(event.sequence)} />
        ))}
      </ul>
    </div>
  );
}
