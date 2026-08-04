/**
 * TanStack Query defaults for a back-office console.
 *
 * The tuning here is deliberately the opposite of a consumer app's. An operator keeps a
 * queue open for hours and acts on what it says, so data goes stale quickly and refetches
 * when the window regains focus — a stale alert queue is how two analysts end up working
 * the same case. Retries are kept low because a failed operational read should surface
 * fast rather than spin for eight seconds behind a spinner.
 */

import { QueryClient } from '@tanstack/react-query';

import { ApiClientError } from '@reliance/api-client';

/** How long a list stays fresh before a refetch is considered. */
const STALE_TIME_MS = 15_000;

/** How long an unused result is kept in case the operator navigates back to it. */
const CACHE_TIME_MS = 300_000;

/** One retry for a read; anything more just delays the error state. */
const QUERY_RETRIES = 1;

/** HTTP statuses below this are the caller's fault and will fail again identically. */
const SERVER_ERROR_STATUS = 500;

/**
 * Retries only what could plausibly succeed on a second attempt.
 *
 * A 403 from a permission the operator does not hold is a settled answer. Retrying it
 * wastes a round trip and, worse, files a second denied-access line in the audit trail.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_RETRIES) return false;
  if (!ApiClientError.isApiClientError(error)) return true;
  return error.isTransportFailure || error.status >= SERVER_ERROR_STATUS;
}

/** Builds the console's query client. One per browser tab, created in the provider tree. */
export function createConsoleQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: CACHE_TIME_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: shouldRetry,
      },
      mutations: {
        // A write is never retried automatically. Idempotency keys make a retry safe at
        // the protocol level, but "safe to repeat" is not the same as "should repeat" —
        // an operator must decide to post an entry a second time.
        retry: false,
      },
    },
  });
}
