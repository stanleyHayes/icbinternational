'use client';

/**
 * The spend breakdown: the ring, its legend and the figures behind both.
 *
 * The header carries the total, so the headline number and the slices come from the same object
 * and cannot disagree. The link under it opens the transaction list on the identical window, and
 * the totals strip there is computed from the same rows — which is how a customer verifies the
 * chart rather than trusting it.
 */

import type { CurrencyCode } from '@reliance/money';
import { Alert, MoneyText } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import type { TransactionFilters } from '@/components/transactions/filters';
import { transactionsRoute } from '@/components/transactions/routes';
import type { TransactionTotals } from '@/components/transactions/totals';
import { describeError } from '@/lib/errors';

import { CategoryTable } from './category-table';
import { ChartFrame } from './chart-frame';
import { SpendDonut } from './spend-donut';

const DONUT_HEIGHT = 280;

/** Props for {@link SpendPanel}. */
export interface SpendPanelProps {
  readonly totals: TransactionTotals | null;
  readonly filters: TransactionFilters;
  readonly periodLabel: string;
  readonly currency: CurrencyCode;
  readonly isPending: boolean;
  readonly error: unknown;
}

function Total({
  totals,
  currency,
}: {
  readonly totals: TransactionTotals | null;
  readonly currency: CurrencyCode;
}) {
  if (!totals) return null;
  return (
    <span className="flex items-baseline gap-2">
      <MoneyText amount={totals.spentMinor.toString()} currency={currency} size="xl" muted />
      <span className="text-fg-muted text-sm">{`across ${totals.byCategory.length} categories`}</span>
    </span>
  );
}

/**
 * @example <SpendPanel totals={totals} filters={filters} periodLabel="the last 30 days" … />
 */
export function SpendPanel(props: SpendPanelProps) {
  const { totals, filters, periodLabel, currency, isPending, error } = props;

  if (error) {
    return (
      <Alert tone="warning" title="We could not work out your spending">
        {describeError(error).message}
      </Alert>
    );
  }

  const nothing = totals !== null && totals.byCategory.length === 0;

  return (
    <ChartFrame
      title="Where your money went"
      description={`Money out over ${periodLabel}, by category.`}
      action={<Total totals={totals} currency={currency} />}
      height={DONUT_HEIGHT}
      loading={isPending}
      chart={<SpendDonut categories={totals?.byCategory ?? []} currency={currency} />}
      table={
        <CategoryTable
          categories={totals?.byCategory ?? []}
          currency={currency}
          filters={filters}
          periodLabel={periodLabel}
        />
      }
      empty={
        nothing ? (
          <EmptyPanel
            bordered={false}
            title="Nothing went out in this period"
            description="Choose a longer period, or a different account, to see where your money goes."
            action={<LinkButton href={transactionsRoute(filters)}>See the activity</LinkButton>}
          />
        ) : undefined
      }
    />
  );
}
