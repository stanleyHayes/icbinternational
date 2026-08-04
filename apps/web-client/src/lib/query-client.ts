/**
 * The query cache, and the retry policy a bank should have.
 *
 * Retrying is only ever right for a failure that might not happen again. A `403` retried twice is
 * three audit events saying the same customer tried the same forbidden thing; an `INSUFFICIENT_FUNDS`
 * retried twice is two more attempts that were always going to be refused. So retries are limited
 * to failures that never reached the bank, and to the bank saying it is temporarily unwell.
 */

import { QueryClient } from '@tanstack/react-query';

import { ApiClientError } from '@reliance/api-client';

/** Anything at or above this status is the bank's problem, not the request's. */
const SERVER_ERROR_FLOOR = 500;

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;
const RETRY_CEILING_MS = 4000;

/** Balances go stale quickly; the shell revalidates on focus rather than polling. */
const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 300_000;

function isTransient(error: unknown): boolean {
  if (!ApiClientError.isApiClientError(error)) return false;
  return error.isTransportFailure || error.status >= SERVER_ERROR_FLOOR;
}

function retry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isTransient(error);
}

function retryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CEILING_MS);
}

/** Builds a cache with the dashboard's defaults. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: true,
        retry,
        retryDelay,
      },
      // A mutation moves money. Repeating one because the network hiccuped is the job of an
      // idempotency key and an explicit "try again", never of a silent retry in a cache library.
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * The cache for the current environment.
 *
 * One per browser session, and a fresh one per server render. Sharing a server cache across
 * requests would let one customer's balances be served to the next.
 */
export function getQueryClient(): QueryClient {
  if (typeof globalThis.window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
