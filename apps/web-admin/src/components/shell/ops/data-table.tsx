/**
 * The console's table.
 *
 * The design system's `Table` already gets the hard parts right — real table markup,
 * `aria-sort`, bigint-safe comparison — so this adds only the four things a back office
 * needs on top of every queue it has: sorting that survives a reload, columns the
 * operator can switch off, named views, and an export that matches the screen exactly.
 */

'use client';

import { EmptyState, Table, type TableColumn } from '@reliance/ui';

import { ColumnDialog } from './column-dialog';
import { DataTableToolbar } from './data-table-toolbar';
import type { DataColumn, DataTableProps } from './data-table-types';
import { useDataTable, type DataTableController } from './use-data-table';

function toTableColumn<T>(column: DataColumn<T>): TableColumn<T> {
  return {
    id: column.id,
    header: column.header,
    cell: column.cell,
    sortValue: column.sortValue ?? column.csv,
    align: column.align,
    className: column.className,
  };
}

function NothingMatches({ rowNoun }: Readonly<{ rowNoun: string }>) {
  return (
    <EmptyState
      title={`No ${rowNoun} match these filters`}
      description="Widen the date range or clear a filter to see more."
    />
  );
}

/** The table itself, once the toolbar's decisions have been applied to it. */
function grid<T>(props: DataTableProps<T>, table: DataTableController<T>) {
  return (
    <Table
      caption={props.caption}
      columns={table.visibleColumns.map(toTableColumn)}
      rows={props.rows}
      rowKey={props.rowKey}
      sort={table.state.sort ?? undefined}
      onSortChange={table.state.setSort}
      empty={props.empty ?? <NothingMatches rowNoun={props.rowNoun} />}
    />
  );
}

/** A sortable, configurable, exportable table. */
export function DataTable<T>(props: DataTableProps<T>) {
  const table = useDataTable(props);
  const { state } = table;

  return (
    <div className="flex min-h-0 flex-col">
      <DataTableToolbar
        filters={props.filters}
        rowCount={props.rows.length}
        totalCount={props.totalCount}
        rowNoun={props.rowNoun}
        views={state.savedViews}
        activeViewId={table.activeViewId}
        onApplyView={state.applyView}
        onSaveView={table.saveCurrentView}
        onDeleteView={state.deleteView}
        onOpenColumns={() => table.setColumnsOpen(true)}
        onExport={table.exportRows}
        actions={props.actions}
      />

      <div className="min-h-0 flex-1 overflow-auto">{grid(props, table)}</div>

      <ColumnDialog
        open={table.columnsOpen}
        onClose={() => table.setColumnsOpen(false)}
        columns={props.columns}
        isVisible={state.isColumnVisible}
        onToggle={state.toggleColumn}
        onShowAll={state.showAllColumns}
      />
    </div>
  );
}

export type { DataColumn, DataTableProps } from './data-table-types';
