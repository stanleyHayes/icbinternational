'use client';

/**
 * One line of the review screen: what the bank has, and a way to change it.
 *
 * The "Change" control names the thing it changes in its accessible label. Nine buttons all
 * announcing "Change" is a list a screen-reader user cannot navigate.
 */

import type { ReactNode } from 'react';

import type { KycStep } from '@reliance/contracts';
import { cn } from '@reliance/ui';

/** Props for {@link ReviewRow}. */
export interface ReviewRowProps {
  readonly label: string;
  /** The stored answer. Falsy renders the not-provided line rather than an empty row. */
  readonly value: ReactNode;
  /** The step that collects it. */
  readonly step: KycStep;
  readonly onChange: (step: KycStep) => void;
}

/** A label, a value, and a link back to the step that set it. */
export function ReviewRow({ label, value, step, onChange }: ReviewRowProps) {
  const provided = Boolean(value);

  return (
    <div className="border-border flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div className="min-w-0">
        <dt className="text-fg-muted text-sm">{label}</dt>
        <dd className={cn('mt-0.5 text-base', provided ? 'text-fg' : 'text-fg-subtle italic')}>
          {provided ? value : 'Not provided'}
        </dd>
      </div>
      <button
        type="button"
        onClick={() => onChange(step)}
        aria-label={`Change ${label.toLowerCase()}`}
        className="text-accent focus-visible:ring-focus shrink-0 rounded-sm px-1 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Change
      </button>
    </div>
  );
}
