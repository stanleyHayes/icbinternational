/**
 * The console's chrome.
 *
 * A fixed sidebar, a thin top bar, and everything else given to the screen. The
 * proportions are deliberate: an operator works one queue for hours, and every pixel the
 * chrome takes is a row of that queue they have to scroll to reach. Only the customer
 * banner is allowed to grow the chrome, and only when it has something to say.
 */

'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { cn, Drawer, FOCUS_RING } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

import { CustomerContextBanner } from './customer-context-banner';
import { SidebarNav } from './nav/sidebar';
import { RelianceMark } from './reliance-mark';
import { CommandPalette } from './search/command-palette';
import { useCommandPalette } from './search/use-command-palette';
import { TopBar } from './top-bar';

/** Anchor the skip link and the top bar's focus target both point at. */
const MAIN_ID = 'console-main';

const SKIP_LINK =
  'sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 ' +
  'focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md';

function ConsoleBrand() {
  return (
    <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <RelianceMark size={24} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-display truncate text-sm font-semibold">{BANK_NAME}</span>
        <span className="font-body text-fg-subtle truncate text-xs">Operations</span>
      </span>
    </div>
  );
}

/** Wraps every screen in the console. Auth screens are rendered outside it. */
export function ConsoleShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const palette = useCommandPalette();
  // Closed by the navigation itself rather than by watching the path: every row inside
  // calls `onNavigate`, and the drawer is modal, so there is no route change it can
  // survive that Escape or the scrim would not already have ended.
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="bg-canvas text-fg flex h-dvh overflow-hidden">
      <a href={`#${MAIN_ID}`} className={cn(SKIP_LINK, FOCUS_RING)}>
        Skip to the main content
      </a>

      <aside className="border-border bg-surface hidden w-56 shrink-0 flex-col border-r lg:flex">
        <ConsoleBrand />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav currentPath={pathname} />
        </div>
      </aside>

      <Drawer
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title="Console sections"
        side="left"
      >
        <SidebarNav currentPath={pathname} onNavigate={() => setNavigationOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenSearch={palette.open} onOpenNavigation={() => setNavigationOpen(true)} />
        <CustomerContextBanner />
        <main id={MAIN_ID} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          {children}
        </main>
      </div>

      <CommandPalette open={palette.isOpen} onClose={palette.close} />
    </div>
  );
}
