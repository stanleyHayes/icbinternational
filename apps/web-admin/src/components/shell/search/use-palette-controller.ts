/**
 * Everything the palette does, separated from what it looks like.
 *
 * Keeping the state machine out of the component is what makes the keyboard behaviour
 * legible: the highlight, the wrap at the ends of the list, and the difference between
 * "Enter opens the pasted id" and "Enter opens the highlighted row" are all decided here,
 * in one place, rather than being spread through a render tree.
 */

'use client';

import {
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';

import { usePermissions } from '@/lib/permissions';
import { useNavigate } from '@/lib/routes';

import { resolveEntityJump, type EntityJump } from './entity-jump';
import { groupResults, type SearchResult } from './search-result';
import { useGlobalSearch } from './use-global-search';

/** Moves an index around the ends of the list rather than stopping at them. */
function wrap(index: number, length: number): number {
  if (length === 0) return 0;
  return (index + length) % length;
}

/** Orders results exactly as they are rendered, so arrow keys follow the eye. */
function useOrderedResults(results: readonly SearchResult[]) {
  return useMemo(() => {
    const ordered = groupResults(results).flatMap(([, items]) => items);
    const indexByKey = new Map(ordered.map((result, index) => [result.key, index]));
    return { ordered, indexByKey };
  }, [results]);
}

/**
 * The highlighted row, tied to the result set it belongs to.
 *
 * Storing the results alongside the index means a new result set resets the highlight as
 * a consequence of rendering rather than as an effect that fires afterwards. A stale
 * highlight surviving even one frame would point Enter at whatever now occupies that
 * position, which in a bank's console is a real hazard rather than a cosmetic one.
 */
function useHighlight(
  ordered: readonly SearchResult[],
): readonly [number, Dispatch<SetStateAction<number>>] {
  const [highlight, setHighlight] = useState<{ of: readonly SearchResult[]; index: number }>({
    of: ordered,
    index: 0,
  });

  const index = highlight.of === ordered ? highlight.index : 0;

  const setIndex: Dispatch<SetStateAction<number>> = (next) =>
    setHighlight({ of: ordered, index: typeof next === 'function' ? next(index) : next });

  return [index, setIndex] as const;
}

interface KeyHandlerInput {
  readonly ordered: readonly SearchResult[];
  readonly activeIndex: number;
  readonly setActiveIndex: Dispatch<SetStateAction<number>>;
  readonly resolve: (path: string) => void;
  readonly jumpPath: string | null;
}

function buildKeyHandler(input: KeyHandlerInput) {
  return (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const destination = input.jumpPath ?? input.ordered[input.activeIndex]?.path;
      if (destination) input.resolve(destination);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    input.setActiveIndex((current) => wrap(current + step, input.ordered.length));
  };
}

/** What the palette's view needs to render itself. */
export interface PaletteController {
  readonly term: string;
  readonly setTerm: (term: string) => void;
  /** `id` shared by the input's `aria-controls` and the listbox. */
  readonly listId: string;
  readonly activeIndex: number;
  readonly results: readonly SearchResult[];
  readonly indexByKey: ReadonlyMap<string, number>;
  readonly orderedCount: number;
  readonly isSearching: boolean;
  readonly failed: boolean;
  /** Set when the typed term is itself an identifier this operator may open. */
  readonly jump: EntityJump | null;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly choose: (result: SearchResult) => void;
}

/**
 * Drives the palette.
 *
 * @param onClose Called before navigating, so the dialog is gone by the time the next
 * screen paints rather than dissolving over it.
 */
export function usePaletteController(onClose: () => void): PaletteController {
  const [term, setTerm] = useState('');
  const deferredTerm = useDeferredValue(term);
  const permissions = usePermissions();
  const navigate = useNavigate();
  const listId = useId();

  const jump = resolveEntityJump(term, permissions);
  const search = useGlobalSearch(jump ? '' : deferredTerm);
  const { ordered, indexByKey } = useOrderedResults(search.results);
  const [activeIndex, setActiveIndex] = useHighlight(ordered);

  const resolve = (path: string): void => {
    onClose();
    setTerm('');
    navigate(path);
  };

  return {
    term,
    setTerm,
    listId,
    activeIndex,
    results: search.results,
    indexByKey,
    orderedCount: ordered.length,
    isSearching: search.isSearching,
    failed: search.failed,
    jump,
    onKeyDown: buildKeyHandler({
      ordered,
      activeIndex,
      setActiveIndex,
      resolve,
      jumpPath: jump?.path ?? null,
    }),
    choose: (result) => resolve(result.path),
  };
}
