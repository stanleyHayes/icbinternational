/**
 * Day-count conventions: how an annual rate becomes a daily one.
 *
 * The house standard is actual/365 — actual days elapsed over a fixed 365-day year,
 * the sterling retail convention the loans, overdraft and deposits lanes already accrue
 * on. Actual/360 exists because the money markets quote on it and a future product may
 * need it; the engine takes the convention as an input rather than a global so that
 * choice stays explicit at the product boundary.
 *
 * A convention contributes exactly one thing to the arithmetic: the denominator of the
 * exact-rational accumulator (`basis points × days in year`). Nothing here rounds.
 */

import { BPS_SCALE, DAYS_PER_YEAR } from '../loans/index.js';

/** A named day-count basis. */
export const DayCountConvention = {
  /** Actual days over a fixed 365-day year. The Reliance retail standard. */
  ACT_365: 'ACT/365',
  /** Actual days over a 360-day year. The money-market convention. */
  ACT_360: 'ACT/360',
} as const;
export type DayCountConvention = (typeof DayCountConvention)[keyof typeof DayCountConvention];

/** The convention every retail deposit product accrues on. */
export const HOUSE_DAY_COUNT: DayCountConvention = DayCountConvention.ACT_365;

/** Days in the money-market year. */
const MONEY_MARKET_YEAR_DAYS = 360n;

/**
 * The exact-rational denominator for a convention: basis points times days in the year.
 *
 * A balance slice of `S` minor units at `R` basis points accrues `S × R / denominator`
 * minor units per day, kept as an unrounded numerator until capitalisation.
 */
export function accrualDenominator(convention: DayCountConvention): bigint {
  const days = convention === DayCountConvention.ACT_360 ? MONEY_MARKET_YEAR_DAYS : DAYS_PER_YEAR;
  return BPS_SCALE * days;
}

/** The denominator the engine accumulates against — the house convention's. */
export const ACCRUAL_DENOMINATOR: bigint = accrualDenominator(HOUSE_DAY_COUNT);
