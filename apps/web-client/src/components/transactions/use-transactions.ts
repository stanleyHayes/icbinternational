'use client';

/**
 * Reading the transaction feed.
 *
 * Two shapes, because two questions are being asked. The list asks "what happened, most recent
 * first" and wants a page at a time, so it is an infinite query walking the cursor. The totals
 * ask "how much, in this window" and cannot be answered from a page, so they read the whole
 * filtered set once and are cached under their own key.
 *
 * Both start from the identical filter object, so the number above the list is the sum of the
 * rows in it.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Transaction, UpdateTransactionRequest } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { collectTransactions } from './collect';
import { toListQuery, type TransactionFilters } from './filters';
import { summarise, type TransactionTotals } from './totals';

/** Rows per page in the scrolling list. Enough to fill a laptop, short enough to arrive fast. */
export const FEED_PAGE_SIZE = 25;

/** Marks the cache entry that holds a complete window rather than one page of it. */
const WHOLE_WINDOW = { scope: 'window' } as const;

/**
 * The paged feed, newest first.
 *
 * `initialPageParam` is the empty string rather than `undefined` so the parameter stays a
 * `string` throughout; the first request simply omits the cursor.
 */
export function useTransactionFeed(filters: TransactionFilters) {
  const query = toListQuery(filters);

  return useInfiniteQuery({
    queryKey: queryKeys.transactions.list(query),
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      browserApi().transactions.list({
        ...query,
        limit: FEED_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.page.cursor ?? undefined,
  });
}

/** Every movement matching the filters, for facets, totals and the CSV. */
export function useTransactionWindow(filters: TransactionFilters, enabled = true) {
  const query = toListQuery(filters);

  return useQuery({
    queryKey: queryKeys.transactions.list({ ...query, ...WHOLE_WINDOW }),
    queryFn: () => collectTransactions(query),
    enabled,
  });
}

/** A window, already summarised. Memoised so a re-render does not re-add several hundred rows. */
export function useTransactionTotals(
  filters: TransactionFilters,
  currency: CurrencyCode,
  enabled = true,
): {
  readonly totals: TransactionTotals | null;
  readonly isPending: boolean;
  readonly error: unknown;
} {
  const window = useTransactionWindow(filters, enabled);
  const collected = window.data;

  const totals = useMemo(
    () => (collected ? summarise(collected.transactions, currency, collected.truncated) : null),
    [collected, currency],
  );

  return { totals, isPending: window.isPending, error: window.error };
}

/** One movement, with its counterparty and the balance it left behind. */
export function useTransaction(transactionId: string): UseQueryResult<Transaction> {
  return useQuery({
    queryKey: queryKeys.transactions.detail(transactionId),
    queryFn: async () => (await browserApi().transactions.get(transactionId)).data,
  });
}

/** The receipt record for a movement — its reference and a signed download link. */
export function useTransactionReceipt(transactionId: string) {
  return useQuery({
    queryKey: [...queryKeys.transactions.detail(transactionId), 'receipt'],
    queryFn: async () => (await browserApi().transactions.receipt(transactionId)).data,
  });
}

/**
 * Recategorises a movement or attaches a note.
 *
 * Only the presentation changes — the amount and the posting behind it are immutable — so the
 * whole transactions tree is invalidated afterwards: recategorising one card payment moves money
 * between two slices of the donut, and leaving the old totals cached would show the customer a
 * chart that disagrees with the row they just edited.
 */
export function useUpdateTransaction(
  transactionId: string,
): UseMutationResult<Transaction, unknown, UpdateTransactionRequest> {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateTransactionRequest) =>
      (await browserApi().transactions.update(transactionId, body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: queryKeys.transactions.all });
    },
  });
}
