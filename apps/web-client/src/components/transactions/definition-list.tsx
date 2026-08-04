'use client';

/**
 * A labelled list of facts — the shape every "details" panel in the money screens takes.
 *
 * A real `<dl>`, so a screen reader reads "Reference, Invoice 1042" as a pair rather than as two
 * unrelated strings in a grid. The accounts screens reuse it for the sort code, IBAN and product
 * terms; it lives beside the transaction detail because that was the first panel to need it.
 *
 * Rows whose value is absent are dropped rather than rendered blank: an empty definition tells
 * the customer the bank has lost something, when in fact there was never anything to show.
 */

import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

/** One labelled fact. */
export interface DefinitionRow {
  /** Stable key, and the label a screen reader reads first. */
  readonly label: string;
  /** Rendered value. A row with `null` or `undefined` here is not rendered at all. */
  readonly value: ReactNode;
  /** Small print under the value — "as at 3 August", "before conversion". */
  readonly hint?: ReactNode;
}

/** Props for {@link DefinitionList}. */
export interface DefinitionListProps {
  readonly rows: readonly DefinitionRow[];
  /** Puts the label above the value instead of beside it, for narrow panels. */
  readonly stacked?: boolean;
  readonly className?: string;
}

/**
 * @example <DefinitionList rows={[{ label: 'Reference', value: 'Invoice 1042' }]} />
 */
export function DefinitionList({ rows, stacked, className }: DefinitionListProps) {
  const visible = rows.filter((row) => row.value !== null && row.value !== undefined);

  return (
    <dl className={cn('divide-border divide-y', className)}>
      {visible.map((row) => (
        <div
          key={row.label}
          className={cn(
            'gap-1 py-3',
            stacked ? 'flex flex-col' : 'grid grid-cols-1 sm:grid-cols-[12rem_1fr] sm:gap-4',
          )}
        >
          <dt className="font-body text-fg-muted text-sm">{row.label}</dt>
          <dd className="font-body text-fg min-w-0 text-base">
            {row.value}
            {row.hint ? <p className="text-fg-muted mt-0.5 text-sm">{row.hint}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
