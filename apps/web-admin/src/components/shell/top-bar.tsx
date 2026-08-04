/**
 * The console's top bar.
 *
 * Three things and nothing else: the way to find anything, the way to see anything, and
 * who is signed in. Everything operational belongs to the screen below it — a toolbar
 * that accumulates one control per feature is a toolbar nobody reads.
 */

'use client';

import { Menu, Search } from 'lucide-react';

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { OperatorIdentity } from './operator-identity';
import { ThemeToggle } from './theme-toggle';

const SEARCH_TRIGGER =
  'flex h-8 min-w-56 items-center gap-2 rounded-md border border-border bg-surface-sunken ' +
  'px-2.5 font-body text-sm text-fg-subtle hover:border-border-strong hover:text-fg-muted';

const KBD = 'ml-auto rounded-sm border border-border px-1 font-mono text-xs';

export interface TopBarProps {
  /** Opens the search palette. Also bound to ⌘K anywhere in the console. */
  readonly onOpenSearch: () => void;
  /** Reveals the navigation on narrow screens. */
  readonly onOpenNavigation: () => void;
}

/** The bar above every screen. */
export function TopBar({ onOpenSearch, onOpenNavigation }: TopBarProps) {
  return (
    <header className="border-border bg-surface flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <button
        type="button"
        onClick={onOpenNavigation}
        aria-label="Show console sections"
        className={cn('text-fg-muted hover:text-fg rounded-md p-1.5 lg:hidden', FOCUS_RING)}
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(SEARCH_TRIGGER, FOCUS_RING, TRANSITION_STATE)}
      >
        <Search aria-hidden="true" className="size-4" />
        <span>Search the bank</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <OperatorIdentity />
      </div>
    </header>
  );
}
