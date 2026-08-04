/**
 * What a data table is doing, separated from what it looks like.
 *
 * The export is built here, from the same visible-column list the table renders, so the
 * two cannot drift. Whichever columns are on screen are the columns in the file.
 */

'use client';

import { useMemo, useState } from 'react';

import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { matchesView } from '@/lib/saved-views';

import type { DataColumn, DataTableProps } from './data-table-types';
import { useTableState, type TableState } from './use-table-state';

function toCsvColumn<T>(column: DataColumn<T>): CsvColumn<T> {
  return { header: column.header, value: column.csv };
}

/** Everything the table's view needs. */
export interface DataTableController<T> {
  readonly state: TableState;
  /** Columns after the operator's visibility choices. */
  readonly visibleColumns: readonly DataColumn<T>[];
  /** The saved view the table currently matches exactly, if any. */
  readonly activeViewId: string | null;
  readonly columnsOpen: boolean;
  readonly setColumnsOpen: (open: boolean) => void;
  /** Absent when the screen withheld the export. */
  readonly exportRows: (() => void) | undefined;
  /** Names a new saved view from the arrangement currently on screen. */
  readonly saveCurrentView: (name: string) => void;
}

/** Drives a {@link DataTableProps} table. */
export function useDataTable<T>(props: DataTableProps<T>): DataTableController<T> {
  const { tableId, columns, rows, exportName } = props;
  const [columnsOpen, setColumnsOpen] = useState(false);

  const state = useTableState({
    tableId,
    filters: props.filterValues,
    onFiltersChange: props.onFilterValuesChange,
    defaultSort: props.defaultSort ?? null,
  });

  const { hiddenColumns } = state;
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.alwaysVisible || !hiddenColumns.includes(column.id)),
    [columns, hiddenColumns],
  );

  const exportRows = (): void => {
    if (!exportName) return;
    // The wall clock is the right clock here: the timestamp names a file for the person
    // who just asked for it. It is not part of the bank's record of anything.
    downloadCsv(
      csvFilename(exportName, new Date().toISOString()),
      toCsv(visibleColumns.map(toCsvColumn), rows),
    );
  };

  return {
    state,
    visibleColumns,
    activeViewId: state.savedViews.find((view) => matchesView(state.current, view))?.id ?? null,
    columnsOpen,
    setColumnsOpen,
    exportRows: exportName ? exportRows : undefined,
    saveCurrentView: (name) => state.saveView(name, new Date().toISOString()),
  };
}
