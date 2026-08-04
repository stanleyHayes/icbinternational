'use client';

/**
 * Money in against money out, month by month.
 *
 * Outflow bars point downwards from a zero line rather than sitting beside inflow bars. Two
 * upward bars invite the eye to read "big month" when the month in question was one where more
 * left than arrived, and the whole question this chart answers is which of the two is bigger.
 *
 * Green for in, the brand's debit red for out — the same colours as every figure on the page,
 * because a customer who has learned that red means money left cannot be asked to re-learn it
 * on the insights screen.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import type { CurrencyCode } from '@reliance/money';

import type { CashflowPoint } from './cashflow-series';
import { compactTick, X_AXIS_PROPS, Y_AXIS_PROPS } from './chart-axes';
import { MONEY_SERIES } from './chart-palette';
import { useChartAnimation } from './use-reduced-motion';

const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0];

/** Props for {@link CashflowBars}. */
export interface CashflowBarsProps {
  readonly points: readonly CashflowPoint[];
  readonly currency: CurrencyCode;
}

/**
 * @example <CashflowBars points={points} currency="GBP" />
 */
export function CashflowBars({ points, currency }: CashflowBarsProps) {
  const animate = useChartAnimation();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points as CashflowPoint[]} stackOffset="sign">
        <CartesianGrid stroke={MONEY_SERIES.grid} vertical={false} />
        <XAxis {...X_AXIS_PROPS} />
        <YAxis {...Y_AXIS_PROPS} tickFormatter={compactTick(currency)} />
        <ReferenceLine y={0} stroke={MONEY_SERIES.axis} />
        <Bar
          dataKey="inValue"
          name="Money in"
          fill={MONEY_SERIES.in}
          radius={BAR_RADIUS}
          isAnimationActive={animate}
        />
        <Bar
          dataKey="outValue"
          name="Money out"
          fill={MONEY_SERIES.out}
          radius={BAR_RADIUS}
          isAnimationActive={animate}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
