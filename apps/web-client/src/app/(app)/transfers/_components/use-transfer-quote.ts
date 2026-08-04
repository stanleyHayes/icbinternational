'use client';

/**
 * Pricing a transfer, and keeping the price honest.
 *
 * The quote is a query rather than a mutation because nothing moves: it prices the payment and
 * answers with the rail, the fee, the arrival estimate and whether the bank will demand a step-up.
 * Holding it in the cache under the exact request means editing the amount and coming back does
 * not re-price needlessly, while changing anything at all produces a new key and therefore a new
 * price.
 *
 * The important behaviour is at the end of its life. When the countdown reaches zero the hook
 * re-prices automatically, and `usable` goes false in between — so there is no moment where a
 * customer can press Send against a rate that no longer exists.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { TransferQuote, TransferQuoteRequest } from '@reliance/contracts';

import { type QuoteExpiry, useQuoteExpiry } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const QUOTE_KEY = 'transfer-quote';
const MS_PER_SECOND = 1000;

/**
 * A re-price that fails has already recorded the failure on the query, which the review screen
 * renders. There is nothing further to do with the rejection here.
 */
function ignoreRefetchRejection(): void {
  return undefined;
}

/** How long the current quote lives, in whole seconds, for the timer's bar. */
function quoteWindow(expiresAt: string | undefined, receivedAtMs: number): number {
  if (!expiresAt) return 1;
  const span = Math.round((new Date(expiresAt).getTime() - receivedAtMs) / MS_PER_SECOND);
  return Math.max(1, span);
}

/** What {@link useTransferQuote} hands back. */
export interface TransferQuoteState {
  readonly quote: TransferQuote | undefined;
  readonly expiry: QuoteExpiry;
  /** Life of the current quote in seconds, for the timer's bar. */
  readonly windowSeconds: number;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: unknown;
  /** True only when there is a live quote that has not run out. */
  readonly usable: boolean;
  /** Prices it again, now. */
  readonly requote: () => void;
}

/**
 * @param request the priced payment, or `null` while the form is incomplete or not yet reviewed.
 */
export function useTransferQuote(request: TransferQuoteRequest | null): TransferQuoteState {
  const query = useQuery({
    queryKey: [QUOTE_KEY, request],
    queryFn: async () => {
      if (!request) throw new Error('A transfer cannot be priced before it is described.');
      return (await browserApi().transfers.quote(request)).data;
    },
    enabled: request !== null,
    // A price is worth nothing once it is stale, and a cached one shown on return to the screen
    // would be a rate the bank is no longer offering.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const quote = query.data;
  const timing = quote
    ? { expiresAt: quote.expiresAt, receivedAtMs: query.dataUpdatedAt }
    : undefined;
  const expiry = useQuoteExpiry(timing);
  const windowSeconds = quoteWindow(quote?.expiresAt, query.dataUpdatedAt);
  const { refetch, isFetching } = query;
  const shouldRefresh = expiry.expired && !isFetching && request !== null;

  useEffect(() => {
    if (shouldRefresh) refetch().catch(ignoreRefetchRejection);
  }, [shouldRefresh, refetch]);

  return {
    quote,
    expiry,
    windowSeconds,
    isLoading: query.isPending && request !== null,
    isRefreshing: isFetching && Boolean(quote),
    error: query.error,
    usable: Boolean(quote) && !expiry.expired && !isFetching,
    requote: () => {
      refetch().catch(ignoreRefetchRejection);
    },
  };
}
