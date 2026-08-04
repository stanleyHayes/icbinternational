/**
 * Which rows the operator has ticked.
 *
 * Held as a set of ids rather than of rows, so a selection survives the list being
 * re-read underneath it — which on a live queue happens every few seconds. Selecting
 * forty postings and losing the selection to a background refresh is the kind of small
 * betrayal that stops people using a bulk control at all.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';

/** A set of selected row identifiers, and the controls over it. */
export interface Selection {
  readonly ids: ReadonlySet<string>;
  readonly isSelected: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly selectAll: (ids: readonly string[]) => void;
  readonly clear: () => void;
  readonly count: number;
}

/** Tracks a row selection across refreshes of the underlying list. */
export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const toggle = useCallback((id: string) => {
    setIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((all: readonly string[]) => setIds(new Set(all)), []);
  const clear = useCallback(() => setIds(new Set<string>()), []);

  return useMemo(
    () => ({
      ids,
      isSelected: (id: string) => ids.has(id),
      toggle,
      selectAll,
      clear,
      count: ids.size,
    }),
    [ids, toggle, selectAll, clear],
  );
}
