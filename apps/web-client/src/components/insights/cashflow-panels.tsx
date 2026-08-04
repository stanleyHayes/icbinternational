'use client';

/**
 * The two charts built from the cash-flow series.
 *
 * They share one request and one derived array, so the bars and the balance line always describe
 * the same months. Splitting them into two components that each fetched would have been simpler
 * to write and would eventually have drawn a January the two of them disagreed about.
 */

import { Alert } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { BASE_CURRENCY } from '@/components/transactions/totals';
import { describeError } from '@/lib/errors';

import { BalanceArea } from './balance-area';
import { CashflowBars } from './cashflow-bars';
import { toCashflowSeries } from './cashflow-series';
import { CashflowTable } from './cashflow-table';
import { ChartFrame } from './chart-frame';
import type { PeriodRange } from './period';
import { useCashflow } from './use-insights';

const CHART_HEIGHT = 260;

/** Props for {@link CashflowPanels}. */
export interface CashflowPanelsProps {
  readonly range: PeriodRange;
  readonly accountId: string | null;
}

/**
 * @example <CashflowPanels range={range} accountId={accountId} />
 */
function NotEnoughHistory() {
  return (
    <EmptyPanel
      bordered={false}
      title="Not enough history yet"
      description="Once this account has been open for a full month we can show how money moved in and out of it."
    />
  );
}

export function CashflowPanels({ range, accountId }: CashflowPanelsProps) {
  const cashflow = useCashflow(range, accountId);

  if (cashflow.isError) {
    return (
      <Alert tone="warning" title="We could not load your cash flow">
        {describeError(cashflow.error).message}
      </Alert>
    );
  }

  const points = cashflow.data ? toCashflowSeries(cashflow.data) : [];
  const currency = cashflow.data?.currency ?? BASE_CURRENCY;
  const table = <CashflowTable points={points} currency={currency} />;
  const empty = cashflow.data && points.length === 0 ? <NotEnoughHistory /> : undefined;

  return (
    <>
      <ChartFrame
        title="Money in and money out"
        description="Each month, side by side. Bars below the line are money that left."
        height={CHART_HEIGHT}
        loading={cashflow.isPending}
        chart={<CashflowBars points={points} currency={currency} />}
        table={table}
        empty={empty}
      />
      <ChartFrame
        title="Your balance over time"
        description="The closing balance at the end of each month. The scale starts at the lowest balance shown, not at zero."
        height={CHART_HEIGHT}
        loading={cashflow.isPending}
        chart={<BalanceArea points={points} currency={currency} />}
        table={table}
        empty={empty}
      />
    </>
  );
}
