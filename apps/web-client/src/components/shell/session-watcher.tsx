'use client';

/**
 * What happens when a session runs out.
 *
 * The typed client already does the recoverable half: a `401` triggers exactly one refresh, shared
 * across every request in flight, and the requests are retried under the rotated cookie. Twelve
 * panels loading at once therefore produce one refresh, not twelve — which matters, because eleven
 * refreshes presenting a token the first has already rotated is indistinguishable from theft, and
 * the API would kill the session outright.
 *
 * This component owns the unrecoverable half. When the retry is still unauthorised, the local
 * marker is cleared, the cache is emptied so no stale balance is left on screen behind a redirect,
 * and the customer is sent to sign-in with the page they were on preserved.
 *
 * It also holds the app's first paint until the browser's request handling is ready, so no panel
 * can fire a request into a worker that has not finished registering.
 */

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { bootstrapBrowserApi, onSessionExpired } from '@/lib/api';
import { HANDLERS_IN_BROWSER } from '@/lib/env';
import { authRoutes, SignInReason, signInWithReturn } from '@/lib/routes';

import { FullPageLoader } from './full-page-loader';

const SESSION_ENDPOINT = '/api/session';

function isAuthScreen(pathname: string): boolean {
  return Object.values(authRoutes).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Wraps the app; renders nothing until the browser can talk to the bank. */
export function SessionWatcher({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(!HANDLERS_IN_BROWSER);

  // Read inside the handler rather than captured by it: the handler is registered once, and a
  // captured pathname would send everyone back to whichever page happened to be open at startup.
  // Written in an effect, never during render — a render-phase write tears under concurrent
  // rendering, which is exactly what the rule about it is protecting against.
  const currentPath = useRef(pathname);
  useEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    onSessionExpired(() => {
      if (isAuthScreen(currentPath.current)) return;
      void fetch(SESSION_ENDPOINT, { method: 'DELETE' });
      queryClient.clear();
      router.replace(signInWithReturn(currentPath.current, SignInReason.EXPIRED));
    });
  }, [queryClient, router]);

  useEffect(() => {
    let live = true;
    void bootstrapBrowserApi().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // `display: contents` so the wrapper adds a single, layout-neutral element. The alternative —
  // returning children directly on one branch and an element on the other — gives this component
  // two return types for no benefit.
  return (
    <div className="contents">
      {ready ? children : <FullPageLoader label="Connecting securely" />}
    </div>
  );
}
