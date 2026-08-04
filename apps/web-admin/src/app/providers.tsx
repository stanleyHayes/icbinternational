/**
 * Everything the console needs before a screen can render.
 *
 * The order matters and is not arbitrary. The query client comes first because the API
 * client's session handling depends on it; the API client before the session, because the
 * session is a query; the session before anything that reads permissions. Customer
 * context and toasts sit inside all of it because they are presentation.
 *
 * Nothing renders until the request layer is ready. A console that painted a queue and
 * then discovered it had no session would have put customer data on screen first and
 * asked the question second.
 */

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ToastProvider } from '@reliance/ui';

import { ApiClientProvider } from '@/lib/api-client';
import { CustomerContextProvider } from '@/lib/customer-context';
import { RETURN_TO_PARAM, SIGN_IN_PATH, USE_IN_BROWSER_API } from '@/lib/env';
import { startInBrowserApi } from '@/lib/in-browser-api';
import { createConsoleQueryClient } from '@/lib/query-client';
import { useReplace, withParam } from '@/lib/routes';
import { AdminSessionProvider } from '@/lib/session';

/** Blocks the first paint until the in-browser request handler is listening, if used. */
function useRequestLayerReady(): boolean {
  const [ready, setReady] = useState(!USE_IN_BROWSER_API);

  useEffect(() => {
    if (ready) return;
    void startInBrowserApi().then(() => setReady(true));
  }, [ready]);

  return ready;
}

/** Sends an operator whose session has ended back to sign-in, keeping their destination. */
function useSessionEndedHandler(): () => void {
  const replace = useReplace();
  const pathname = usePathname();

  return useCallback(() => {
    if (pathname.startsWith(SIGN_IN_PATH)) return;
    replace(withParam(SIGN_IN_PATH, RETURN_TO_PARAM, pathname));
  }, [replace, pathname]);
}

/** The console's provider tree. Mounted once, by the root layout. */
export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(createConsoleQueryClient);
  const ready = useRequestLayerReady();
  const onSessionEnded = useSessionEndedHandler();

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider onSessionEnded={onSessionEnded}>
        <AdminSessionProvider>
          <CustomerContextProvider>
            <ToastProvider>{children}</ToastProvider>
          </CustomerContextProvider>
        </AdminSessionProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
