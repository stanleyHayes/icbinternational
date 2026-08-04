/**
 * The palette's text field.
 *
 * A combobox over the result listbox: focus never leaves this input, and the highlighted
 * row is named by `aria-activedescendant`. That is what lets an operator keep typing to
 * narrow a list they are already arrowing through.
 */

'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { Input, Spinner } from '@reliance/ui';

/** Placeholder and accessible name — one sentence, so both can be the same. */
export const SEARCH_PROMPT = 'Search customers, transactions, investigations and screens';

export interface PaletteInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** `id` of the listbox this field controls. */
  readonly listId: string;
  /** Index of the highlighted option, or `-1` when there are none. */
  readonly activeIndex: number;
  readonly hasResults: boolean;
  readonly busy: boolean;
}

/** The search field at the top of the palette. */
export function PaletteInput(props: PaletteInputProps) {
  const { value, onValueChange, onKeyDown, listId, activeIndex, hasResults, busy } = props;
  const field = useRef<HTMLInputElement>(null);

  // Focus is moved once, when the palette opens. An operator hits ⌘K in order to type,
  // and a search box they then have to click is a broken shortcut. Doing it here rather
  // than with `autoFocus` also means it happens after the dialog's own focus trap has
  // settled, which is the difference between it working and it silently not.
  useEffect(() => field.current?.focus(), []);

  return (
    <div className="flex items-center gap-2 px-4 pb-3">
      <Search aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />
      <Input
        ref={field}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={SEARCH_PROMPT}
        aria-label={SEARCH_PROMPT}
        role="combobox"
        aria-expanded={hasResults}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hasResults ? `${listId}-option-${activeIndex}` : undefined}
        containerClassName="flex-1"
        className="border-0 bg-transparent shadow-none"
      />
      {busy && <Spinner className="size-4" label="Searching" />}
    </div>
  );
}
