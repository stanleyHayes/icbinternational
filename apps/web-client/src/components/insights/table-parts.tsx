'use client';

/**
 * The bits of markup the insight tables share.
 *
 * These tables are the accessible half of the charts, so their structure matters more than their
 * appearance: `<caption>`, `<th scope="col">` across the top and `<th scope="row">` down the
 * side, which is what lets a screen reader say "Groceries, Total, £274.50" instead of reading a
 * grid of orphaned numbers. Sharing the parts keeps every table on the page built the same way.
 */

import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

/** Padding shared by every cell, so columns line up between the two tables. */
export const CELL = 'px-3 py-2 align-middle';

/** Figures are right-aligned with fixed-width digits, so a column can be scanned down. */
export const NUMERIC = 'text-right tabular-nums';

/** The header row. The first column is a label; the rest are figures. */
export function TableHead({ headings }: { readonly headings: readonly string[] }) {
  return (
    <thead>
      <tr className="border-border text-fg-muted border-b">
        {headings.map((heading, index) => (
          <th
            key={heading}
            scope="col"
            className={cn(CELL, 'font-medium', index === 0 ? 'text-left' : NUMERIC)}
          >
            {heading}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** The row's own label, which is what a screen reader reads before each figure in it. */
export function RowHeader({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <th scope="row" className={cn(CELL, 'text-left font-normal', className)}>
      {children}
    </th>
  );
}

/** A figure cell. */
export function Figure({ children }: { readonly children: ReactNode }) {
  return <td className={cn(CELL, NUMERIC)}>{children}</td>;
}

/** The table's frame: a horizontal scroll container and the caption. */
export function DataTable({
  caption,
  children,
}: {
  readonly caption: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="text-fg-muted py-2 text-left text-sm">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
