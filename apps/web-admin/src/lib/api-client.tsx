/**
 * The console's single API client.
 *
 * One client per browser tab, held in context. That is not a style preference: the
 * client coordinates token refresh through state it holds internally, so a client
 * constructed inside a component would scope that coordination to the component and
 * turn one refresh into one refresh per mounted query.
 */

'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { createApiClient, type ApiClient } from '@reliance/api-client';

import { API_BASE_PATH } from '@/lib/env';

const ApiClientContext = createContext<ApiClient | null>(null);

export interface ApiClientProviderProps {
  /**
   * Called when a request is refused as unauthenticated and the client's single silent
   * refresh has already been spent. The console uses it to end the session and route to
   * sign-in, preserving where the operator was.
   */
  readonly onSessionEnded: () => void;
  readonly children: ReactNode;
}

/**
 * The client, plus the set of things to tell when a session ends.
 *
 * The indirection exists because the client is built once and the callback is an inline
 * arrow that changes on every parent render. Rebuilding the client to pick up the new
 * arrow would throw away its in-flight refresh, so instead the client is handed one
 * permanent function that fans out to whoever is currently subscribed.
 */
function createRuntime() {
  const listeners = new Set<() => void>();
  const client = createApiClient({
    baseUrl: API_BASE_PATH,
    onUnauthenticated: () => {
      for (const listener of listeners) listener();
    },
  });

  return { client, listeners };
}

/** Provides the API client to the tree. Mount once, above every data-reading component. */
export function ApiClientProvider({ onSessionEnded, children }: ApiClientProviderProps) {
  const [runtime] = useState(createRuntime);

  useEffect(() => {
    runtime.listeners.add(onSessionEnded);
    return () => {
      runtime.listeners.delete(onSessionEnded);
    };
  }, [runtime, onSessionEnded]);

  return <ApiClientContext.Provider value={runtime.client}>{children}</ApiClientContext.Provider>;
}

/**
 * The API client for the current tab.
 *
 * @throws {Error} when called outside {@link ApiClientProvider}, which is a wiring
 * mistake rather than a runtime condition and should fail immediately.
 */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used inside ApiClientProvider.');
  return client;
}
