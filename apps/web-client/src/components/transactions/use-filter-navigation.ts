'use client';

/**
 * The filters, bound to the address bar.
 *
 * `replace` rather than `push`: ticking four category boxes should not put four entries in the
 * history, so Back leaves the transaction list instead of undoing one checkbox at a time. Scroll
 * position is held too — a filter that jumps the customer to the top of the page has taken away
 * the row they were reading.
 */

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { NO_FILTERS, readFilters, writeFilters, type TransactionFilters } from './filters';

/** The current path plus a query string is a route by construction, but not to the type system. */
function sameRouteWithQuery(pathname: string, query: string): Route {
  return (query ? `${pathname}?${query}` : pathname) as Route;
}

/** The current filters and the two ways to change them. */
export interface FilterNavigation {
  readonly filters: TransactionFilters;
  /** Replaces the whole set. */
  readonly setFilters: (next: TransactionFilters) => void;
  /** Changes some fields and leaves the rest alone. */
  readonly patchFilters: (changes: Partial<TransactionFilters>) => void;
  /** Back to every movement on every account. */
  readonly clearFilters: () => void;
}

/** Reads and writes the transaction filters held in the query string. */
export function useFilterNavigation(): FilterNavigation {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(search)), [search]);

  const setFilters = useCallback(
    (next: TransactionFilters) => {
      router.replace(sameRouteWithQuery(pathname, writeFilters(next).toString()), {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const patchFilters = useCallback(
    (changes: Partial<TransactionFilters>) => setFilters({ ...filters, ...changes }),
    [filters, setFilters],
  );

  const clearFilters = useCallback(() => setFilters(NO_FILTERS), [setFilters]);

  return { filters, setFilters, patchFilters, clearFilters };
}
