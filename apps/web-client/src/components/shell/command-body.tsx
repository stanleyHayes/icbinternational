'use client';

/**
 * The search field and results inside the palette.
 *
 * A separate component from the dialog for one reason: it is mounted only while the palette is
 * open, so the query and the highlight are reset by unmounting rather than by an effect.
 */

import { Search } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import type { CommandItem } from './command-items';
import { CommandResults } from './command-results';
import { useCommandSearch } from './use-command-search';

/** Props for {@link CommandBody}. */
export interface CommandBodyProps {
  readonly items: readonly CommandItem[];
  readonly onChoose: (item: CommandItem) => void;
}

/** The combobox input and the result list it controls. */
export function CommandBody({ items, onChoose }: CommandBodyProps) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const search = useCommandSearch(items, onChoose);
  const activeId = search.activeItem ? `${listId}-${search.activeItem.id}` : undefined;

  // The modal puts focus on its own panel as it opens; the field claims it back on the next tick.
  useEffect(() => {
    const timer = globalThis.setTimeout(() => input.current?.focus(), 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="border-border bg-canvas flex items-center gap-3 rounded-md border px-3">
        <Search aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label="Search accounts, payments and settings"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={search.onKeyDown}
          placeholder="Accounts, payments, settings…"
          className="text-fg placeholder:text-fg-subtle h-11 w-full bg-transparent text-base outline-none"
        />
      </div>

      <CommandResults
        listId={listId}
        matches={search.matches}
        activeId={activeId}
        query={search.query}
        onChoose={onChoose}
        onHover={search.setActiveId}
      />
    </>
  );
}
