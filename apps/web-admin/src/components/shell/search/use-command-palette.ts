/**
 * The ⌘K binding.
 *
 * Bound on the document rather than on a field, because the whole point is that it works
 * from wherever the operator's hands already are. It deliberately does nothing while the
 * operator is typing into another control with a modifier-free key, and it does not
 * shadow the browser's own find — only the modified combination is claimed.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

/** The key that opens the palette, with either platform's command modifier. */
const OPEN_KEY = 'k';

/** Open/close state for the console's search palette. */
export interface CommandPaletteState {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

/** Wires ⌘K / Ctrl+K and returns the palette's open state. */
export function useCommandPalette(): CommandPaletteState {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== OPEN_KEY) return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      setIsOpen((wasOpen) => !wasOpen);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { isOpen, open, close };
}
