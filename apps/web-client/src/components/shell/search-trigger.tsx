'use client';

/**
 * The control that opens the command palette.
 *
 * Two renderings of one action. On a wide screen the shortcut is shown next to the label, because
 * a shortcut nobody is told about is a shortcut nobody uses; on a phone there is no keyboard to
 * press it with, so it collapses to an icon and the label moves into the accessible name.
 */

import { Search } from 'lucide-react';

import { Button } from '@reliance/ui';

import { useCommandPalette } from './command-palette-provider';

/** Opens the palette. */
export function SearchTrigger() {
  const palette = useCommandPalette();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={palette.open}
        startIcon={<Search aria-hidden="true" className="size-4" />}
        className="hidden sm:inline-flex"
      >
        Search
        <kbd className="border-border text-fg-subtle ml-2 rounded-sm border px-1.5 py-0.5 font-mono text-xs">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        iconOnly
        aria-label="Search the app"
        onClick={palette.open}
        className="sm:hidden"
      >
        <Search aria-hidden="true" className="size-5" />
      </Button>
    </>
  );
}
