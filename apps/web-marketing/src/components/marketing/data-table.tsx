import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

export interface DataTableColumn {
  readonly key: string;
  readonly label: string;
  /** Right-aligns the column. Use for every money and rate column, and nothing else. */
  readonly numeric?: boolean;
}

export interface DataTableProps {
  /** Read out before the table. Says what the table contains, not that it is a table. */
  readonly caption: string;
  readonly columns: readonly DataTableColumn[];
  readonly children: ReactNode;
  /** Shown under the table: effective dates, footnotes, the word "variable". */
  readonly footnote?: ReactNode;
}

/**
 * A published table of figures.
 *
 * `<caption>`, `scope="col"` and a real `<th>` per row are not optional on a rate table:
 * without them a screen reader reads a wall of numbers with no idea which product each
 * belongs to. The wrapper scrolls horizontally on its own so a wide table never makes the
 * page scroll sideways.
 */
export function DataTable({ caption, columns, children, footnote }: DataTableProps) {
  return (
    <div>
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-border bg-surface-sunken border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'text-fg px-4 py-3 text-sm font-semibold',
                    column.numeric === true && 'text-right',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface">{children}</tbody>
        </table>
      </div>
      {footnote ? <p className="text-fg-muted mt-3 text-sm">{footnote}</p> : null}
    </div>
  );
}

/** A body row. The first cell is the row header. */
export function DataRow({ children }: { readonly children: ReactNode }) {
  return <tr className="border-border border-b last:border-0">{children}</tr>;
}

/** The row's own heading cell. */
export function RowHeader({
  children,
  detail,
}: {
  readonly children: ReactNode;
  readonly detail?: string;
}) {
  return (
    <th scope="row" className="text-fg px-4 py-3.5 text-left font-medium">
      {children}
      {detail ? (
        <span className="text-fg-muted mt-0.5 block text-sm font-normal">{detail}</span>
      ) : null}
    </th>
  );
}

/** A data cell. */
export function DataCell({
  children,
  numeric = false,
}: {
  readonly children: ReactNode;
  readonly numeric?: boolean;
}) {
  return <td className={cn('text-fg-muted px-4 py-3.5', numeric && 'text-right')}>{children}</td>;
}
