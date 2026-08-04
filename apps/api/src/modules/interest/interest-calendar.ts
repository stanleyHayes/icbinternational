/**
 * Calendar arithmetic for capitalisation periods.
 *
 * A period is a calendar month written `YYYY-MM`. ISO month strings compare
 * lexicographically in chronological order, which is what lets the stores use plain
 * string comparisons for "has this period been capitalised already".
 *
 * All math is UTC: value dates are day-granular business dates, not instants, so no
 * timezone is ever consulted.
 */

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/** Shape of a period string: four-digit year, two-digit month. */
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTHS_PER_YEAR = 12;
const ISO_DATE_LENGTH = 10;
const PERIOD_LENGTH = 7;
const MONTH_RADIX = 10;

/**
 * The period before the one `today` falls in — the period a capitalisation run on
 * `today` settles. `today` is an ISO calendar date (`YYYY-MM-DD`).
 */
export function previousPeriod(today: string): string {
  const [year, month] = parseYearMonth(today.slice(0, PERIOD_LENGTH));
  return month === 1 ? `${year - 1}-${MONTHS_PER_YEAR}` : `${year}-${pad(month - 1)}`;
}

/** The last calendar day of a period, as an ISO date — the value date of its payout. */
export function lastDayOfPeriod(period: string): string {
  assertValidPeriod(period);
  const [year, month] = parseYearMonth(period);
  // Day zero of the following month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The period an ISO calendar date falls in. */
export function periodOf(date: string): string {
  return date.slice(0, PERIOD_LENGTH);
}

/** Rejects a malformed period before it can reach a query or a ledger reference. */
export function assertValidPeriod(period: string): void {
  if (PERIOD_PATTERN.test(period)) return;

  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message: `A capitalisation period must be YYYY-MM, got: ${period}`,
    context: { period },
  });
}

function parseYearMonth(period: string): [number, number] {
  const [year = Number.NaN, month = Number.NaN] = period
    .split('-')
    .map((part) => Number.parseInt(part, MONTH_RADIX));
  return [year, month];
}

function pad(month: number): string {
  return String(month).padStart(2, '0');
}
