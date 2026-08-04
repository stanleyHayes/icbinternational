'use client';

/**
 * The closing balance over time.
 *
 * The Y axis is *not* forced to zero. A balance that moves between £3,900 and £4,300 flattens to
 * a straight line on a zero-based axis, and the shape of the month is the entire point of the
 * chart. The trade-off is that the area under the curve exaggerates the movement, which is why
 * the exact closing balances are published in the table beneath it.
 *
 * One series, the brand accent, filled with a gradient to the transparent — it reads as a level
 * rather than as a quantity, which is what a balance is.
 */

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import type { CurrencyCode } from '@reliance/money';

import type { CashflowPoint } from './cashflow-series';
import { compactTick, X_AXIS_PROPS, Y_AXIS_PROPS } from './chart-axes';
import { MONEY_SERIES } from './chart-palette';
import { useChartAnimation } from './use-reduced-motion';

const FILL_OPACITY_TOP = 0.35;
const FILL_OPACITY_BOTTOM = 0.02;
const STROKE_WIDTH = 2;

/** Props for {@link BalanceArea}. */
export interface BalanceAreaProps {
  readonly points: readonly CashflowPoint[];
  readonly currency: CurrencyCode;
}

/**
 * @example <BalanceArea points={points} currency="GBP" />
 */
export function BalanceArea({ points, currency }: BalanceAreaProps) {
  const animate = useChartAnimation();
  // `useId` emits punctuation that is legal in an id but awkward inside `url(#…)`, so it is
  // stripped. Two of these charts on one page must still not collide, hence the id at all.
  const gradientId = `rb-balance-${useId().replaceAll(/\W/g, '')}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points as CashflowPoint[]}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MONEY_SERIES.balance} stopOpacity={FILL_OPACITY_TOP} />
            <stop
              offset="100%"
              stopColor={MONEY_SERIES.balance}
              stopOpacity={FILL_OPACITY_BOTTOM}
            />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={MONEY_SERIES.grid} vertical={false} />
        <XAxis {...X_AXIS_PROPS} />
        <YAxis {...Y_AXIS_PROPS} domain={['auto', 'auto']} tickFormatter={compactTick(currency)} />
        <Area
          type="monotone"
          dataKey="balanceValue"
          name="Closing balance"
          stroke={MONEY_SERIES.balance}
          strokeWidth={STROKE_WIDTH}
          fill={`url(#${gradientId})`}
          isAnimationActive={animate}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
