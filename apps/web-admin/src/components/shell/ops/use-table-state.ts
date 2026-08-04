/**
 * A table's arrangement: which columns are shown, how it is sorted, and the named views
 * an operator has kept.
 *
 * Held here rather than inside the table component so a screen can drive the same state
 * from the URL, from a filter bar and from a saved view without three sources disagreeing
 * about what is currently on screen.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  EMPTY_VIEW_STATE,
  loadSavedViews,
  loadWorkingState,
  removeView,
  storeSavedViews,
  storeWorkingState,
  upsertView,
  type SavedView,
  type ViewSort,
  type ViewState,
} from '@/lib/saved-views';

export interface TableStateOptions {
  /** Namespace for this table's stored views. Keep it stable across releases. */
  readonly tableId: string;
  /** Filter values the screen currently has applied, so a view can capture them. */
  readonly filters?: Readonly<Record<string, string>>;
  /** Applies a view's filters back to the screen. */
  readonly onFiltersChange?: (filters: Readonly<Record<string, string>>) => void;
  readonly defaultSort?: ViewSort | null;
}

/** Everything the toolbar and the table need in order to agree with each other. */
export interface TableState {
  readonly hiddenColumns: readonly string[];
  readonly isColumnVisible: (columnId: string) => boolean;
  readonly toggleColumn: (columnId: string) => void;
  readonly showAllColumns: () => void;
  readonly sort: ViewSort | null;
  readonly setSort: (sort: ViewSort) => void;
  readonly savedViews: readonly SavedView[];
  readonly saveView: (name: string, savedAt: string) => void;
  readonly deleteView: (id: string) => void;
  readonly applyView: (view: SavedView) => void;
  /** The arrangement as it stands, ready to be named and kept. */
  readonly current: ViewState;
}

function readStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** Adds an id to the list, or removes it if it is already there. */
function toggled(list: readonly string[], id: string): readonly string[] {
  return list.includes(id) ? list.filter((candidate) => candidate !== id) : [...list, id];
}

/**
 * Read once, on the first client render, rather than corrected afterwards in an effect.
 *
 * Safe because a data table only ever mounts inside the console shell, which itself
 * renders only after the session has resolved in the browser — there is no server-rendered
 * table for a stored arrangement to disagree with, and no flash of the default one.
 */
function initialArrangement(tableId: string) {
  const storage = readStorage();
  return storage ? loadWorkingState(storage, tableId) : null;
}

/** Columns and sort, restored from the last time this operator used the table. */
function useArrangement(tableId: string, defaultSort: ViewSort | null) {
  const stored = useState(() => initialArrangement(tableId))[0];
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>(
    stored?.hiddenColumns ?? [],
  );
  const [sort, setSort] = useState<ViewSort | null>(stored?.sort ?? defaultSort);

  return { hiddenColumns, setHiddenColumns, sort, setSort };
}

/** The operator's named views for this table. */
function useNamedViews(tableId: string) {
  const [savedViews, setSavedViews] = useState<readonly SavedView[]>(() => {
    const storage = readStorage();
    return storage ? loadSavedViews(storage, tableId) : [];
  });

  const persist = useCallback(
    (next: readonly SavedView[]) => {
      setSavedViews(next);
      const storage = readStorage();
      if (storage) storeSavedViews(storage, tableId, next);
    },
    [tableId],
  );

  return { savedViews, persist };
}

/** Drives one table's columns, sort and saved views. */
export function useTableState(options: TableStateOptions): TableState {
  const { tableId, filters, onFiltersChange, defaultSort = null } = options;
  const { hiddenColumns, setHiddenColumns, sort, setSort } = useArrangement(tableId, defaultSort);
  const { savedViews, persist } = useNamedViews(tableId);

  const current = useMemo<ViewState>(
    () => ({ filters: filters ?? EMPTY_VIEW_STATE.filters, sort, hiddenColumns }),
    [filters, sort, hiddenColumns],
  );

  useEffect(() => {
    const storage = readStorage();
    if (storage) storeWorkingState(storage, tableId, current);
  }, [tableId, current]);

  const applyView = useCallback(
    (view: SavedView) => {
      setHiddenColumns(view.state.hiddenColumns);
      setSort(view.state.sort);
      onFiltersChange?.(view.state.filters);
    },
    [onFiltersChange, setHiddenColumns, setSort],
  );

  return {
    hiddenColumns,
    isColumnVisible: (columnId) => !hiddenColumns.includes(columnId),
    toggleColumn: (columnId) => setHiddenColumns((previous) => toggled(previous, columnId)),
    showAllColumns: () => setHiddenColumns([]),
    sort,
    setSort,
    savedViews,
    saveView: (name, savedAt) =>
      persist(upsertView(savedViews, { id: `${tableId}:${name}`, name, savedAt, state: current })),
    deleteView: (id) => persist(removeView(savedViews, id)),
    applyView,
    current,
  };
}
