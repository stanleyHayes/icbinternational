/**
 * Global search, on ⌘K.
 *
 * The console's primary way of getting anywhere. An operator with a customer id in the
 * clipboard should be looking at that customer two keystrokes later without touching a
 * menu, so a recognised identifier resolves before any request is made; everything else
 * searches customers, transactions, investigations and the console's own screens at once.
 */

'use client';

import { CornerDownLeft } from 'lucide-react';

import { Dialog } from '@reliance/ui';

import { PaletteInput } from './palette-input';
import { PaletteResults } from './palette-results';
import { MIN_SEARCH_LENGTH } from './use-global-search';
import { usePaletteController } from './use-palette-controller';

const HINT = 'Paste a customer, account or transaction id to go straight to it.';

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The search palette. Rendered by the console shell; opened from anywhere with ⌘K. */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const palette = usePaletteController(onClose);
  const hasResults = palette.orderedCount > 0;

  return (
    <Dialog open={open} onClose={onClose} title="Search" description={HINT} size="lg">
      <div className="-m-5 flex flex-col">
        <PaletteInput
          value={palette.term}
          onValueChange={palette.setTerm}
          onKeyDown={palette.onKeyDown}
          listId={palette.listId}
          activeIndex={palette.activeIndex}
          hasResults={hasResults}
          busy={palette.isSearching}
        />

        {palette.jump ? (
          <JumpRow label={palette.jump.label} id={palette.jump.id} />
        ) : (
          <PaletteResults
            listId={palette.listId}
            results={palette.results}
            indexByKey={palette.indexByKey}
            activeIndex={palette.activeIndex}
            onChoose={palette.choose}
          />
        )}

        <PaletteFooter
          term={palette.term}
          hasResults={hasResults || palette.jump !== null}
          failed={palette.failed}
        />
      </div>
    </Dialog>
  );
}

function JumpRow({ label, id }: Readonly<{ label: string; id: string }>) {
  return (
    <p className="border-border font-body flex items-center gap-2 border-t px-4 py-3 text-sm">
      <CornerDownLeft aria-hidden="true" className="text-accent size-4" />
      <span className="font-medium">{label}</span>
      <span className="text-fg-muted font-mono text-xs">{id}</span>
    </p>
  );
}

interface PaletteFooterProps {
  readonly term: string;
  readonly hasResults: boolean;
  readonly failed: boolean;
}

function footerMessage(props: PaletteFooterProps): string | null {
  if (props.failed) return 'Search is unavailable right now. Try again in a moment.';
  if (props.term.trim().length < MIN_SEARCH_LENGTH) return HINT;
  if (!props.hasResults) return `Nothing in the bank matches “${props.term.trim()}”.`;
  return null;
}

function PaletteFooter(props: PaletteFooterProps) {
  const message = footerMessage(props);
  if (!message) return null;

  return (
    <p
      aria-live="polite"
      className="border-border font-body text-fg-muted border-t px-4 py-3 text-sm"
    >
      {message}
    </p>
  );
}
