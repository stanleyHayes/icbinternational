/**
 * What the overview reads.
 *
 * The live feed is the only thing on this screen that has to be fresh to the second, so
 * it is the only thing that streams. Everything else is a figure an operations manager
 * glances at, and polling those on the same interval would put the bank's whole reporting
 * surface behind a timer for no benefit.
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { Permission } from '@reliance/contracts';

import { opsKeys, useEventStream, type FeedTransport } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { usePermissions } from '@/lib/permissions';

/** Rows of the live feed held on screen. Enough to see a burst, few enough to scan. */
const FEED_SIZE = 12;

/** How often the feed is re-read when the stream is not carrying anything. */
const POLL_INTERVAL_MS = 15_000;

/** How long a headline figure is trusted before it is re-read. */
const FIGURE_STALE_MS = 60_000;

/** The reporting currency the overview totals in. */
export const REPORTING_CURRENCY = 'GBP';

/** The trial balance, which is also the answer to "does the book still foot". */
export function useLedgerSnapshot() {
  const client = useApiClient();
  const allowed = usePermissions().has(Permission.REPORT_READ);

  return useQuery({
    queryKey: opsKeys.trialBalance(REPORTING_CURRENCY),
    queryFn: async ({ signal }) =>
      (await client.admin.trialBalance({ currency: REPORTING_CURRENCY }, { signal })).data,
    enabled: allowed,
    staleTime: FIGURE_STALE_MS,
  });
}

/** The most recent postings across the bank, kept current however the platform allows. */
export function useLivePostings() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const allowed = usePermissions().has(Permission.TRANSACTION_READ);
  const queryKey = opsKeys.transactions({ feed: 'live' });

  const onEvent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
    // `queryKey` is rebuilt on every render but is structurally constant, and TanStack
    // compares keys structurally. Depending on the client alone keeps the stream open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const transport: FeedTransport = useEventStream(onEvent);

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => client.admin.transactions({ limit: FEED_SIZE }, { signal }),
    enabled: allowed,
    refetchInterval: transport === 'polling' ? POLL_INTERVAL_MS : false,
  });

  return { ...query, transport, allowed };
}
