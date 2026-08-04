'use client';

/**
 * The insights screen.
 *
 * The window lives in the query string; the account comes from the shell's switcher, because
 * "show me this for my joint account" is a scope the customer sets once and expects to hold
 * across the app.
 *
 * Everything on the page that says how much was spent is derived from one window of the
 * transaction feed. The charts that need history the feed does not carry — cash flow, the balance
 * line, recurring payments — say so by being visibly separate panels with their own periods.
 */

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, type ReactNode } from 'react';

import type { CurrencyCode } from '@reliance/money';
import { Card, CardHeader } from '@reliance/ui';

import { BudgetList } from '@/components/insights/budget-list';
import { CashflowPanels } from '@/components/insights/cashflow-panels';
import { MerchantLeaderboard } from '@/components/insights/merchant-leaderboard';
import {
  PERIOD_LABEL,
  PERIOD_PARAM,
  periodFilters,
  periodRange,
  readPeriod,
  type Period,
} from '@/components/insights/period';
import { PeriodSwitcher } from '@/components/insights/period-switcher';
import { SpendPanel } from '@/components/insights/spend-panel';
import { SubscriptionTracker } from '@/components/insights/subscription-tracker';
import { useSpendPeriod } from '@/components/insights/use-spend';
import type { TransactionFilters } from '@/components/transactions/filters';
import { BASE_CURRENCY, type MerchantTotal } from '@/components/transactions/totals';
import { useSelectedAccount } from '@/lib/selected-account';

/** A titled panel with a plain body — the frame the non-chart sections share. */
function Section({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} description={description} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** The window switcher, and the current window in words. */
function usePeriodNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = readPeriod(searchParams.get(PERIOD_PARAM));

  const choosePeriod = useCallback(
    (next: Period) => {
      const query = new URLSearchParams(searchParams.toString());
      query.set(PERIOD_PARAM, next);
      router.replace(`${pathname}?${query.toString()}` as Route, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { period, choosePeriod };
}

interface SideBySideProps {
  readonly merchants: readonly MerchantTotal[];
  readonly currency: CurrencyCode;
  readonly filters: TransactionFilters;
  readonly periodLabel: string;
}

/** The two half-width panels: where the money went, and what the customer told us to watch. */
function MerchantsAndBudgets({ merchants, currency, filters, periodLabel }: SideBySideProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section
        title="Where you spend most"
        description={`The places that took the most money over ${periodLabel}.`}
      >
        <MerchantLeaderboard merchants={merchants} currency={currency} filters={filters} />
      </Section>

      <Section
        title="Budgets"
        description="Limits you have set, and how far through each one you are."
      >
        <BudgetList />
      </Section>
    </div>
  );
}

/** Everything a customer can learn about where their money goes. */
export function InsightsScreen() {
  const { accountId } = useSelectedAccount();
  const { period, choosePeriod } = usePeriodNavigation();

  const filters = useMemo(() => periodFilters(period, accountId), [period, accountId]);
  const range = useMemo(() => periodRange(period), [period]);

  const spend = useSpendPeriod(filters);
  const currency = spend.totals?.currency ?? BASE_CURRENCY;
  const periodLabel = PERIOD_LABEL[period].toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <PeriodSwitcher value={period} onChange={choosePeriod} />
      </div>

      <SpendPanel
        totals={spend.totals}
        filters={filters}
        periodLabel={periodLabel}
        currency={currency}
        isPending={spend.isPending}
        error={spend.error}
      />

      <MerchantsAndBudgets
        merchants={spend.totals?.byMerchant ?? []}
        currency={currency}
        filters={filters}
        periodLabel={periodLabel}
      />

      <CashflowPanels range={range} accountId={accountId} />

      <Section
        title="Recurring payments"
        description="Merchants that charge you on a schedule, soonest first."
      >
        <SubscriptionTracker filters={filters} />
      </Section>
    </div>
  );
}
