'use client';

/**
 * The Table.
 *
 * A real `<table>` with a `<caption>` and `<th scope>`, because that markup is what lets a screen
 * reader say "Amount, column 3, row 12". A grid of divs is an unnavigable wall of text, and a
 * statement is exactly the kind of dense tabular data that gets read cell by cell.
 *
 * Sorting happens here when a column supplies `sortValue`, and is delegated to the caller via
 * `onSortChange` when it does not — which is what a paginated ledger needs, since sorting one
 * page of a hundred thousand postings sorts the wrong thing.
 */

import { useMemo, type ReactNode } from 'react';

import { ArrowDownIcon, ArrowUpIcon, SortIcon } from '../foundation/icons.js';
import { FOCUS_RING_INSET, TRANSITION_STATE } from '../foundation/styles.js';
import { useControllableState } from '../hooks/use-controllable-state.js';
import { cn } from '../lib/cn.js';

import {
  ARIA_SORT,
  sortRows,
  type SortDirection,
  type SortValue,
  type TableSort,
} from './table-sort.js';

export interface TableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  /** Supplying this makes the column sortable, and sorts it here rather than on the server. */
  readonly sortValue?: (row: T) => SortValue;
  /** Amount columns are right-aligned so their digits line up down the column. */
  readonly align?: 'start' | 'end';
  readonly className?: string;
}

const ALIGN: Readonly<Record<'start' | 'end', string>> = { start: 'text-left', end: 'text-right' };
const CELL = 'px-4 py-3 align-middle';

function SortGlyph({ active, direction }: Readonly<{ active: boolean; direction: SortDirection }>) {
  if (!active) return <SortIcon className="size-3.5 opacity-40" />;
  const Glyph = direction === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return <Glyph className="size-3.5" />;
}

interface HeadCellProps<T> {
  readonly column: TableColumn<T>;
  readonly sort: TableSort | undefined;
  readonly sortable: boolean;
  readonly onToggle: (columnId: string) => void;
}

function HeadCell<T>({ column, sort, sortable, onToggle }: HeadCellProps<T>) {
  const active = sort?.columnId === column.id;

  return (
    <th
      scope="col"
      aria-sort={active && sort ? ARIA_SORT[sort.direction] : undefined}
      className={cn(CELL, 'text-fg-muted font-medium', ALIGN[column.align ?? 'start'])}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onToggle(column.id)}
          className={cn(
            'hover:text-fg inline-flex items-center gap-1 rounded-sm',
            FOCUS_RING_INSET,
            TRANSITION_STATE,
          )}
        >
          {column.header}
          <SortGlyph active={active} direction={sort?.direction ?? 'asc'} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

export interface TableProps<T> {
  /** Describes the table for screen readers. Visually hidden unless `showCaption`. */
  readonly caption: string;
  readonly showCaption?: boolean;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  /** Stable identity per row — an account id, a journal id. Never the array index. */
  readonly rowKey: (row: T) => string;
  readonly sort?: TableSort;
  readonly defaultSort?: TableSort;
  /** Set for server-side sorting: every header becomes sortable and nothing is sorted locally. */
  readonly onSortChange?: (sort: TableSort) => void;
  /** Shown in place of the rows when there are none. */
  readonly empty?: ReactNode;
  readonly className?: string;
}

/**
 * @example
 * <Table
 *   caption="Recent transactions"
 *   columns={columns}
 *   rows={transactions}
 *   rowKey={(transaction) => transaction.id}
 *   defaultSort={{ columnId: 'bookedAt', direction: 'desc' }}
 * />
 */
export function Table<T>(props: TableProps<T>) {
  const { caption, showCaption, columns, rows, rowKey, empty, className } = props;
  const [sort, setSort] = useControllableState<TableSort | undefined>({
    value: props.sort,
    defaultValue: props.defaultSort,
    onChange: (next) => next && props.onSortChange?.(next),
  });

  const active = columns.find((column) => column.id === sort?.columnId);
  const visible = useMemo(
    () => (sort ? sortRows(rows, active?.sortValue, sort.direction) : rows),
    [rows, active, sort],
  );

  const toggle = (columnId: string): void => {
    // A second click on the same column reverses it; a first click on a new one starts ascending,
    // which is the only direction a user can predict without reading the arrow.
    const flip = sort?.columnId === columnId && sort.direction === 'asc';
    setSort({ columnId, direction: flip ? 'desc' : 'asc' });
  };

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="font-body w-full border-collapse text-sm">
        <caption className={cn('text-fg-muted py-2 text-left text-sm', !showCaption && 'sr-only')}>
          {caption}
        </caption>
        <thead>
          <tr className="border-border border-b">
            {columns.map((column) => (
              <HeadCell
                key={column.id}
                column={column}
                sort={sort}
                sortable={Boolean(column.sortValue) || Boolean(props.onSortChange)}
                onToggle={toggle}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-border hover:bg-surface-sunken border-b last:border-0"
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(CELL, ALIGN[column.align ?? 'start'], column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && empty}
    </div>
  );
}
