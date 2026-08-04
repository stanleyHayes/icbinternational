'use client';

/**
 * Spend by category, derived from the transaction feed.
 *
 * The bank publishes `/insights/spend`, and this deliberately does not use it. The reason is the
 * one rule these screens are built around: **a category total and the list of payments behind it
 * must be the same arithmetic over the same rows.** Two independent computations of "£274.50 on
 * groceries in March" — one server-side over a window the server chose, one client-side over the
 * rows the list actually returned — will disagree eventually, and when they do the customer is
 * left holding two numbers from their own bank that do not match.
 *
 * So the donut, the merchant leaderboard, the category table and the "see these payments" link
 * are all built from a single `collectTransactions` call under a single cache key. Click through
 * from any slice and the rows add up to the slice, because they are the rows the slice was made
 * from.
 *
 * The window loader is bounded and says when it stopped, and the screens pass that through rather
 * than presenting a partial figure as a complete one.
 */

import { useMemo } from 'react';

import type { CurrencyCode } from '@reliance/money';

import type { TransactionFilters } from '@/components/transactions/filters';
import {
  BASE_CURRENCY,
  currenciesIn,
  type TransactionTotals,
} from '@/components/transactions/totals';
import {
  useTransactionTotals,
  useTransactionWindow,
} from '@/components/transactions/use-transactions';

/** Everything the spend charts read. */
export interface SpendPeriod {
  readonly totals: TransactionTotals | null;
  /** Currencies present in the window, most-used first. Drives the currency switch. */
  readonly currencies: readonly CurrencyCode[];
  readonly isPending: boolean;
  readonly error: unknown;
}

/**
 * Summarised spend for a window.
 *
 * @param filters the window, already resolved from the period and the selected account.
 * @param currency which currency to report in; defaults to the most-used one in the window.
 */
export function useSpendPeriod(filters: TransactionFilters, currency?: CurrencyCode): SpendPeriod {
  const window = useTransactionWindow(filters);
  const rows = window.data?.transactions;

  const currencies = useMemo(() => (rows ? currenciesIn(rows) : []), [rows]);
  const reporting = currency ?? currencies[0] ?? BASE_CURRENCY;
  const { totals, isPending, error } = useTransactionTotals(filters, reporting);

  return { totals, currencies, isPending, error };
}
