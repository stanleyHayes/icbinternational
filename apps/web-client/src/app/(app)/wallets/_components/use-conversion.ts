'use client';

/**
 * Converting between the customer's own currencies.
 *
 * The quote is the whole product here: it fixes the rate, the spread and both amounts for a short
 * window, and `convert` takes the quote's id and nothing else — so there is no field a caller
 * could pass that would let what executes differ from what was shown.
 *
 * The countdown is the same machinery the transfer flow uses, and it governs the button the same
 * way: no live quote, no conversion.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { FxQuote, FxQuoteRequest, Transfer } from '@reliance/contracts';

import { movementKeys, useQuoteExpiry, type QuoteExpiry } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const QUOTE_KEY = 'fx-quote';
const MS_PER_SECOND = 1000;

/** What {@link useConversion} hands the screen. */
export interface Conversion {
  readonly quote: FxQuote | undefined;
  readonly expiry: QuoteExpiry;
  readonly windowSeconds: number;
  readonly quoting: boolean;
  readonly requoting: boolean;
  readonly quoteError: unknown;
  /** True only when there is a live quote that has not run out. */
  readonly usable: boolean;
  readonly requote: () => void;
  readonly convert: UseMutationResult<Transfer, unknown, string>;
}

/** A re-price whose failure is already on the query has nothing more to report. */
function ignore(): void {
  return undefined;
}

/** How long the current quote lives, in whole seconds. */
function windowFor(expiresAt: string | undefined, receivedAtMs: number): number {
  if (!expiresAt) return 1;
  return Math.max(1, Math.round((new Date(expiresAt).getTime() - receivedAtMs) / MS_PER_SECOND));
}

/** Prices the conversion. Never cached: a stale rate is a rate the bank is not offering. */
function useQuoteQuery(request: FxQuoteRequest | null) {
  return useQuery({
    queryKey: [QUOTE_KEY, request],
    queryFn: async () => {
      if (!request) throw new Error('A conversion cannot be priced before it is described.');
      return (await browserApi().fx.quote(request)).data;
    },
    enabled: request !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** @param request the conversion being priced, or `null` while the form is incomplete. */
export function useConversion(request: FxQuoteRequest | null): Conversion {
  const cache = useQueryClient();
  const [locked, setLocked] = useState(false);

  const query = useQuoteQuery(request);

  const quote = query.data;
  const expiry = useQuoteExpiry(
    quote ? { expiresAt: quote.expiresAt, receivedAtMs: query.dataUpdatedAt } : undefined,
  );

  const { refetch, isFetching } = query;
  const stale = expiry.expired && !isFetching && request !== null && !locked;

  useEffect(() => {
    if (stale) refetch().catch(ignore);
  }, [stale, refetch]);

  const convert = useMutation({
    mutationFn: async (quoteId: string) => (await browserApi().fx.convert(quoteId)).data,
    onMutate: () => setLocked(true),
    onSettled: () => setLocked(false),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
        cache.invalidateQueries({ queryKey: movementKeys.transfers.all }),
      ]);
    },
  });

  return {
    quote,
    expiry,
    windowSeconds: windowFor(quote?.expiresAt, query.dataUpdatedAt),
    quoting: query.isPending && request !== null,
    requoting: isFetching && Boolean(quote),
    quoteError: query.error,
    usable: Boolean(quote) && !expiry.expired && !isFetching,
    requote: () => {
      refetch().catch(ignore);
    },
    convert,
  };
}
