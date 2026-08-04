'use client';

/**
 * The state behind the command palette: what has been typed, what matches, and which row is
 * highlighted.
 *
 * Kept out of the component so the keyboard contract can be read on its own. The highlight moves
 * with the arrow keys and never wraps — a list that loops from the last row back to the first gives
 * a screen-reader user no way to tell they have reached the end.
 *
 * There is no reset: the palette body is mounted only while the palette is open, so closing it
 * unmounts this state and reopening starts fresh. Resetting in an effect would be a second, later
 * source of truth for the same thing.
 */

import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';

import { rankItems, type CommandItem } from './command-items';

const ARROW_DOWN = 'ArrowDown';
const ARROW_UP = 'ArrowUp';
const ENTER = 'Enter';

/** What {@link useCommandSearch} hands back. */
export interface CommandSearch {
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly matches: readonly CommandItem[];
  readonly activeItem: CommandItem | undefined;
  readonly setActiveId: (id: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * @param items every entry the palette can offer.
 * @param onChoose called with the entry the customer settled on.
 */
export function useCommandSearch(
  items: readonly CommandItem[],
  onChoose: (item: CommandItem) => void,
): CommandSearch {
  const [query, setQueryState] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => rankItems(items, query), [items, query]);
  const activeItem = matches[Math.min(activeIndex, Math.max(0, matches.length - 1))];

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setActiveIndex(0);
  }, []);

  const setActiveId = useCallback(
    (id: string) => {
      const index = matches.findIndex((item) => item.id === id);
      if (index >= 0) setActiveIndex(index);
    },
    [matches],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === ARROW_DOWN) {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
      } else if (event.key === ARROW_UP) {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === ENTER && activeItem) {
        event.preventDefault();
        onChoose(activeItem);
      }
    },
    [activeItem, matches.length, onChoose],
  );

  return { query, setQuery, matches, activeItem, setActiveId, onKeyDown };
}
