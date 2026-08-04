'use client';

/**
 * Everything the browser half of the dashboard needs, mounted once.
 *
 * Order matters. The theme wraps everything so no child ever paints in the wrong palette. The
 * query cache comes next, because the toast region below it is what a failed mutation reports
 * through. The session watcher sits innermost, where it can use the router.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '@reliance/ui';

import { SessionWatcher } from '@/components/shell/session-watcher';
import { ThemeProvider } from '@/components/shell/theme-provider';
import { getQueryClient } from '@/lib/query-client';

/**
 * The client-side provider tree.
 *
 * The cache is created through `useState` rather than at module scope so a server render gets a
 * fresh one per request while the browser keeps a single instance across navigations. A module
 * constant would be shared by every request the server handles — one customer's balances served
 * to the next.
 */
export function Providers({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionWatcher>{children}</SessionWatcher>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
