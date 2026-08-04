/**
 * Choosing several rows at once, and knowing exactly which.
 *
 * Bulk actions are where an operations console does its real damage: "select all" over a
 * filtered queue, one click, and four hundred customers have been written to. So the
 * selection is always an explicit set of ids rather than a "select all matching" flag —
 * a bulk decision can then name its subjects in the confirmation, and it can never act on
 * a row that arrived after the operator looked.
 *
 * Selection is pruned to the rows currently on screen. Filtering a queue therefore drops
 * whatever fell out of it, instead of quietly keeping it selected out of sight.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';

/** A set of chosen row ids and the operations a bulk toolbar needs. */
export interface Selection {
  readonly ids: readonly string[];
  readonly count: number;
  readonly isSelected: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  /** Selects every visible row, or clears them all when they are already selected. */
  readonly toggleAll: () => void;
  readonly clear: () => void;
  /** True when every visible row is chosen and there is at least one. */
  readonly allSelected: boolean;
  /** True when some but not all visible rows are chosen — the tri-state checkbox. */
  readonly someSelected: boolean;
}

/**
 * Tracks which of `visibleIds` the operator has chosen.
 *
 * @param visibleIds Ids of the rows currently rendered, in order.
 */
export function useSelection(visibleIds: readonly string[]): Selection {
  const [chosen, setChosen] = useState<readonly string[]>([]);

  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const ids = useMemo(() => chosen.filter((id) => visible.has(id)), [chosen, visible]);

  const toggle = useCallback((id: string) => {
    setChosen((previous) =>
      previous.includes(id) ? previous.filter((candidate) => candidate !== id) : [...previous, id],
    );
  }, []);

  const allSelected = ids.length > 0 && ids.length === visibleIds.length;

  const toggleAll = useCallback(() => {
    setChosen((previous) => {
      const selectedHere = previous.filter((id) => visible.has(id));
      return selectedHere.length === visible.size ? [] : [...visible];
    });
  }, [visible]);

  const clear = useCallback(() => setChosen([]), []);

  return {
    ids,
    count: ids.length,
    isSelected: (id) => visible.has(id) && chosen.includes(id),
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected: ids.length > 0 && !allSelected,
  };
}
