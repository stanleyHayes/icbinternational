/**
 * Our customer, and the person on the list, side by side.
 *
 * Everything an analyst needs to discount a hit is a difference between two records, and
 * the only reliable way to see a difference is to put the two records next to each other
 * with the same fields in the same order. A screen that shows the listed entry and makes
 * the analyst remember the customer produces exactly the mistake it is meant to prevent.
 *
 * The disposition sits underneath both columns rather than beside one of them, because
 * the decision is about the pair.
 */

'use client';

import type { ScreeningHit } from '@reliance/api-client';
import { Badge, EmptyState } from '@reliance/ui';

import { MatchScore } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';

import { ScreeningDisposition } from './screening-disposition';

const COLUMN = 'flex flex-col gap-2 rounded-md border border-border p-3';
const LABEL = 'font-body text-xs uppercase tracking-wider text-fg-subtle';
const VALUE = 'font-body text-sm text-fg';

interface FieldProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={LABEL}>{label}</dt>
      <dd className={VALUE}>{children}</dd>
    </div>
  );
}

export interface ScreeningComparisonProps {
  readonly hit: ScreeningHit | null;
  readonly onDecided: () => void;
}

/** The two records and the decision about them. */
export function ScreeningComparison({ hit, onDecided }: ScreeningComparisonProps) {
  if (!hit) {
    return (
      <EmptyState
        title="Choose a hit to compare"
        description="Select a row to put our customer's details beside the listed record."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <MatchScore score={hit.matchScore} />
        <Badge>{humaniseCode(hit.matchType)}</Badge>
        <span className="font-body text-fg-muted text-sm">{hit.listName}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <dl className={COLUMN}>
          <h4 className="font-body text-fg text-sm font-semibold">Our customer</h4>
          <Field label="Name">{hit.customerName}</Field>
          <Field label="Customer identifier">
            <span className="font-mono text-xs">{hit.userId}</span>
          </Field>
          <Field label="Screened at">
            <span className="font-mono text-xs">{formatInstant(hit.screenedAt)}</span>
          </Field>
        </dl>

        <dl className={COLUMN}>
          <h4 className="font-body text-fg text-sm font-semibold">The listed record</h4>
          <Field label="Name on the list">{hit.matchedName}</Field>
          <Field label="List">{hit.listName}</Field>
          <Field label="Why the engine matched them">{hit.detail}</Field>
        </dl>
      </div>

      <ScreeningDisposition hit={hit} onDecided={onDecided} />
    </div>
  );
}
