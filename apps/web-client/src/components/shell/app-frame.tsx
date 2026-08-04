'use client';

/**
 * The application frame: everything that is on screen no matter which page is open.
 *
 * One `<main>`, carrying the skip link's target and a `key` bound to the pathname. The key is
 * there for a specific reason — React reuses the subtree across navigations, which means scroll
 * position and focus survive a route change, and a screen-reader user who has just navigated finds
 * themselves in the middle of the previous page.
 *
 * The bottom padding on small screens clears the fixed bottom bar. Without it the last row of
 * every list sits underneath it and cannot be tapped.
 */

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { SelectedAccountProvider } from '@/lib/selected-account';

import { CommandPaletteProvider } from './command-palette-provider';
import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';
import { SkipLink, MAIN_CONTENT_ID } from './skip-link';
import { StepUpProvider } from './step-up-provider';
import { TopBar } from './top-bar';

/**
 * Wraps every signed-in screen.
 *
 * @example
 * // app/(app)/layout.tsx
 * export default function AppLayout({ children }: { children: ReactNode }) {
 *   return <AppFrame>{children}</AppFrame>;
 * }
 */
export function AppFrame({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();

  return (
    <SelectedAccountProvider>
      <StepUpProvider>
        <CommandPaletteProvider>
          <div className="bg-canvas flex min-h-dvh">
            <SkipLink />

            <div className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
              <Sidebar />
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main
                key={pathname}
                id={MAIN_CONTENT_ID}
                tabIndex={-1}
                className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 lg:pb-10"
              >
                {children}
              </main>
            </div>

            <MobileNav />
          </div>
        </CommandPaletteProvider>
      </StepUpProvider>
    </SelectedAccountProvider>
  );
}
