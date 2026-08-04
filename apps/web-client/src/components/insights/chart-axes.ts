/**
 * Axis settings shared by the charts.
 *
 * Two charts on one page whose axes differ by a pixel of tick length read as two components from
 * two different products. Recharts detects its axes by element type, so they cannot be wrapped in
 * a component of ours — the settings are shared as spreadable objects instead.
 */

import { formatMinor, type CurrencyCode } from '@reliance/money';

import { MONEY_SERIES } from './chart-palette';

const AXIS_FONT_SIZE = 12;
const Y_AXIS_WIDTH = 72;

/** The category axis: month labels along the bottom. */
export const X_AXIS_PROPS = {
  dataKey: 'label',
  stroke: MONEY_SERIES.axis,
  tickLine: false,
  fontSize: AXIS_FONT_SIZE,
} as const;

/** The value axis. No axis line — the grid already carries the scale. */
export const Y_AXIS_PROPS = {
  stroke: MONEY_SERIES.axis,
  tickLine: false,
  axisLine: false,
  width: Y_AXIS_WIDTH,
  fontSize: AXIS_FONT_SIZE,
} as const;

/**
 * Formats an axis tick.
 *
 * Compact — `£3.2K` — because four ticks reading "£3,200.00" are unreadable at this size. It is
 * the only rounded money on the page, and the exact figures sit in the table underneath.
 */
export function compactTick(currency: CurrencyCode): (value: number) => string {
  return (value) => formatMinor(BigInt(Math.round(value)), currency, { compact: true });
}
