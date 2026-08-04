'use client';

/**
 * The insight series the bank computes for us.
 *
 * Cash flow, subscriptions and budgets come from the API because they are genuinely
 * server-side questions: a cash-flow bucket needs the closing balance at each period boundary,
 * and a recurring-merchant detector needs more history than a window of the feed contains.
 *
 * Spend by category deliberately does *not* live here. It is derived from the transaction feed —
 * see `use-spend.ts` — so that the donut and the list it links into are the same rows added the
 * same way.
 *
 * Keys are declared locally because `lib/query-keys.ts` belongs to the shell lane and has no
 * insights vocabulary yet. They are namespaced under `insights` so a future move is a rename,
 * not a hunt.
 */

import { useQuery } from '@tanstack/react-query';

import type { Budget, Cashflow, Subscription } from '@reliance/contracts';

import { browserApi } from '@/lib/api';

import type { PeriodRange } from './period';

/** Cache keys for everything on Insights that the API computes. */
export const insightsKeys = {
  all: ['insights'] as const,
  cashflow: (scope: Readonly<Record<string, unknown>>) =>
    [...insightsKeys.all, 'cashflow', scope] as const,
  subscriptions: () => [...insightsKeys.all, 'subscriptions'] as const,
  budgets: () => [...insightsKeys.all, 'budgets'] as const,
};

/** Subscriptions and budgets are short lists; one page holds them. */
const LIST_PAGE_SIZE = 50;

const DAY_STARTS = 'T00:00:00.000Z';
const DAY_ENDS = 'T23:59:59.999Z';

/**
 * Money in, money out and the closing balance, bucketed by month.
 *
 * Monthly rather than daily: a customer asking "am I spending more than I earn" is asking about
 * months, and a 90-bar daily chart answers a question nobody asked.
 */
export function useCashflow(range: PeriodRange, accountId: string | null) {
  const query = {
    from: `${range.from}${DAY_STARTS}`,
    to: `${range.to}${DAY_ENDS}`,
    granularity: 'MONTH' as const,
    ...(accountId ? { accountId } : {}),
  };

  return useQuery({
    queryKey: insightsKeys.cashflow(query),
    queryFn: async (): Promise<Cashflow> => (await browserApi().insights.cashflow(query)).data,
  });
}

/** Merchants that charge the customer on a schedule. */
export function useSubscriptions() {
  return useQuery({
    queryKey: insightsKeys.subscriptions(),
    queryFn: async (): Promise<readonly Subscription[]> =>
      (await browserApi().insights.subscriptions({ limit: LIST_PAGE_SIZE })).data,
  });
}

/** The customer's budgets and how far through each one they are. */
export function useBudgets() {
  return useQuery({
    queryKey: insightsKeys.budgets(),
    queryFn: async (): Promise<readonly Budget[]> =>
      (await browserApi().insights.listBudgets({ limit: LIST_PAGE_SIZE })).data,
  });
}
