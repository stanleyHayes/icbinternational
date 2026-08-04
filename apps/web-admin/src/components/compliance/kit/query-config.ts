/**
 * How this lane talks to the platform.
 *
 * Queue screens are read constantly and decided on rarely, so the defaults lean towards
 * freshness: a short stale window and a refetch when the tab regains focus, because an
 * analyst who alt-tabs back to a queue and works a row somebody else already cleared has
 * wasted the only thing a compliance team is short of.
 *
 * Page size is the contract's ceiling. These queues are worked to zero rather than
 * browsed, and an analyst dragging through pages of twenty-five loses the sense of how
 * much is left — which is the number the whole shift is planned around.
 */

import { MAX_PAGE_SIZE } from '@reliance/contracts';

/** Rows fetched per queue read. The contract's maximum. */
export const QUEUE_PAGE_SIZE = MAX_PAGE_SIZE;

/** How long a queue read is trusted before it is refetched. */
export const QUEUE_STALE_TIME_MS = 15_000;

/** Root of every query key in this lane, so one call can clear the whole console cache. */
export const CONSOLE_KEY = 'console' as const;

/** Options shared by every queue read. */
export const queueQueryOptions = {
  staleTime: QUEUE_STALE_TIME_MS,
  refetchOnWindowFocus: true,
} as const;
