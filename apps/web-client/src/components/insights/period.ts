/**
 * The window Insights reports on.
 *
 * Held in the URL like every other filter on the money screens, so "my spending last quarter" is
 * a link somebody can send. The presets are the four windows people actually ask about; anything
 * else is expressed as explicit dates, which the transactions screen already understands.
 *
 * Dates are computed in UTC. A window boundary that moved with the reader's time zone would put
 * the same payment inside March for one person and outside it for another, and the totals either
 * side of that boundary would stop reconciling.
 */

import { NO_FILTERS, type TransactionFilters } from '@/components/transactions/filters';
import { nowMs } from '@/lib/clock';

/** The windows Insights offers. */
export const Period = {
  LAST_30_DAYS: '30d',
  LAST_90_DAYS: '90d',
  THIS_MONTH: 'month',
  LAST_12_MONTHS: '12m',
} as const;
/** A window Insights offers. */
export type Period = (typeof Period)[keyof typeof Period];

/** Query-string key carrying the window. */
export const PERIOD_PARAM = 'period';

/** What each window is called on screen. */
export const PERIOD_LABEL: Readonly<Record<Period, string>> = {
  [Period.LAST_30_DAYS]: 'Last 30 days',
  [Period.LAST_90_DAYS]: 'Last 90 days',
  [Period.THIS_MONTH]: 'This month',
  [Period.LAST_12_MONTHS]: 'Last 12 months',
};

/** Windows in the order the switcher lists them. */
export const PERIOD_ORDER: readonly Period[] = [
  Period.LAST_30_DAYS,
  Period.THIS_MONTH,
  Period.LAST_90_DAYS,
  Period.LAST_12_MONTHS,
];

/** The window a customer sees on their first visit. */
export const DEFAULT_PERIOD: Period = Period.LAST_30_DAYS;

const MS_PER_DAY = 86_400_000;
const DAYS_IN_30 = 30;
const DAYS_IN_90 = 90;
const DAYS_IN_YEAR = 365;
const ISO_DATE_LENGTH = 10;

/** `YYYY-MM-DD` in UTC. */
function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The first day of the month containing `timestamp`, in UTC. */
function startOfMonth(timestamp: number): string {
  const at = new Date(timestamp);
  return isoDay(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** Inclusive calendar bounds of a window. */
export interface PeriodRange {
  readonly from: string;
  readonly to: string;
}

/** How far back each rolling window reaches. `THIS_MONTH` is calendar-based, not rolling. */
const WINDOW_DAYS: Readonly<Record<Period, number>> = {
  [Period.LAST_30_DAYS]: DAYS_IN_30,
  [Period.LAST_90_DAYS]: DAYS_IN_90,
  [Period.LAST_12_MONTHS]: DAYS_IN_YEAR,
  [Period.THIS_MONTH]: DAYS_IN_30,
};

/** The calendar dates a window covers, both ends inclusive. */
export function periodRange(period: Period): PeriodRange {
  const now = nowMs();
  const to = isoDay(now);

  if (period === Period.THIS_MONTH) return { from: startOfMonth(now), to };
  return { from: isoDay(now - WINDOW_DAYS[period] * MS_PER_DAY), to };
}

/** Narrows an untrusted query value to a window, falling back to the default. */
export function readPeriod(raw: string | null): Period {
  const known: readonly string[] = PERIOD_ORDER;
  return known.includes(raw ?? '') ? (raw as Period) : DEFAULT_PERIOD;
}

/**
 * The transaction filters a window and an account resolve to.
 *
 * This is the join between Insights and Activity: the donut is built from the movements this
 * filter returns, and every "see these payments" link carries the same object into the URL. Two
 * screens, one filter, one set of rows — which is why the totals agree.
 */
export function periodFilters(period: Period, accountId: string | null): TransactionFilters {
  const { from, to } = periodRange(period);
  return { ...NO_FILTERS, accountId, from, to };
}
