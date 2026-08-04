/**
 * The shape of an operational table.
 *
 * `csv` is required on every column, and that is the load-bearing decision here. An
 * export that silently included a hidden column, or omitted one that was on screen, is a
 * file nobody can reconcile against the thing it came from — and reconciliation is most
 * of what these exports exist for. Making the text form mandatory also gives every
 * column a sort key for free.
 */

import type { ReactNode } from 'react';

import type { SortValue } from '@reliance/ui';

import type { ViewSort } from '@/lib/saved-views';

/** One column of an operational table. */
export interface DataColumn<T> {
  readonly id: string;
  /** Header text. Plain text so it can also label the column switch and the export. */
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** The cell as text: what the export writes, and the default sort key. */
  readonly csv: (row: T) => string;
  /** Overrides the sort key — use it for amounts, which sort as bigint minor units. */
  readonly sortValue?: (row: T) => SortValue;
  /** Amount columns are right-aligned so their digits line up down the column. */
  readonly align?: 'start' | 'end';
  /** Identity columns cannot be switched off: a row nobody can name is unusable. */
  readonly alwaysVisible?: boolean;
  readonly className?: string;
}

export interface DataTableProps<T> {
  /** Namespace for this table's saved views. Keep it stable across releases. */
  readonly tableId: string;
  /** Describes the table for screen readers. */
  readonly caption: string;
  /** What one row is, plural: "alerts", "postings", "customers". */
  readonly rowNoun: string;
  readonly columns: readonly DataColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly defaultSort?: ViewSort | null;
  /** Rows the platform says match, when the endpoint returns a count. */
  readonly totalCount?: number;
  /** Filter controls rendered in the toolbar. */
  readonly filters?: ReactNode;
  /** Current filter values, so a saved view can capture and restore them. */
  readonly filterValues?: Readonly<Record<string, string>>;
  readonly onFilterValuesChange?: (filters: Readonly<Record<string, string>>) => void;
  /** Base filename for the export. Omit to withhold the export control entirely. */
  readonly exportName?: string;
  /** Screen-specific toolbar actions. */
  readonly actions?: ReactNode;
  /** Shown in place of the rows. Defaults to a plain "nothing matches" state. */
  readonly empty?: ReactNode;
}
