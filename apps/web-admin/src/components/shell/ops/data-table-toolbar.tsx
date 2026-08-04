/**
 * The strip above a data table.
 *
 * Filters on the left because that is where the operator's attention starts; the count
 * in the middle because it is the answer to "did my filter do what I meant"; view,
 * column and export controls on the right because they are configuration, not work.
 */

'use client';

import { Columns3, Download } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@reliance/ui';

import { formatCount } from '@/lib/format';
import type { SavedView } from '@/lib/saved-views';

import { ViewPicker } from './view-picker';

export interface DataTableToolbarProps {
  /** Filter controls, typically a `FilterBar`. */
  readonly filters?: ReactNode;
  /** Rows currently rendered. */
  readonly rowCount: number;
  /** Rows the platform says match, when it returns a count. */
  readonly totalCount?: number;
  /** What the rows are, plural — "alerts", "postings". Used in the count. */
  readonly rowNoun: string;
  readonly views: readonly SavedView[];
  readonly activeViewId: string | null;
  readonly onApplyView: (view: SavedView) => void;
  readonly onSaveView: (name: string) => void;
  readonly onDeleteView: (id: string) => void;
  readonly onOpenColumns: () => void;
  /** Omit to hide the export control — some queues must not leave the building. */
  readonly onExport?: () => void;
  /** Screen-specific actions, e.g. "Raise a manual posting". */
  readonly actions?: ReactNode;
}

function CountLabel({
  rowCount,
  totalCount,
  rowNoun,
}: Readonly<Pick<DataTableToolbarProps, 'rowCount' | 'totalCount' | 'rowNoun'>>) {
  const shown = formatCount(rowCount);
  const label =
    totalCount === undefined || totalCount === rowCount
      ? `${shown} ${rowNoun}`
      : `${shown} of ${formatCount(totalCount)} ${rowNoun}`;

  return (
    <p aria-live="polite" className="font-body text-fg-muted text-sm">
      {label}
    </p>
  );
}

/** The table's toolbar. */
export function DataTableToolbar(props: DataTableToolbarProps) {
  return (
    <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
      {props.filters}
      <CountLabel rowCount={props.rowCount} totalCount={props.totalCount} rowNoun={props.rowNoun} />

      <div className="ml-auto flex items-center gap-1.5">
        <ViewPicker
          views={props.views}
          activeViewId={props.activeViewId}
          onApply={props.onApplyView}
          onSave={props.onSaveView}
          onDelete={props.onDeleteView}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onOpenColumns}
          startIcon={<Columns3 className="size-4" />}
        >
          Columns
        </Button>
        {props.onExport && (
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onExport}
            startIcon={<Download className="size-4" />}
          >
            Export CSV
          </Button>
        )}
        {props.actions}
      </div>
    </div>
  );
}
