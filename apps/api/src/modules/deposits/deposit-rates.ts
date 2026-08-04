/**
 * The term deposit rate board.
 *
 * These are the rates the savings pages publish, and they are the whole product: a term
 * deposit is a promise to leave money alone for a fixed period in exchange for a fixed
 * rate. The curve rises with tenor and then flattens, which is what a normal yield curve
 * does and what a saver comparing one-year and five-year rates expects to see.
 */

import { type DepositRate } from '@reliance/contracts';

const STERLING = 'GBP';

/** The minimum placement on every tenor. Below this the interest is not worth the paperwork. */
const MINIMUM_PLACEMENT_MINOR_UNITS = '100000';

/**
 * The board, tenor by tenor.
 *
 * A table rather than a list of calls, because these numbers are the product: an analyst
 * repricing the one-year rate should be editing a row that says `annualRateBps`, not
 * counting positional arguments.
 */
const BOARD: readonly { termMonths: number; annualRateBps: number }[] = [
  { termMonths: 1, annualRateBps: 315 },
  { termMonths: 3, annualRateBps: 395 },
  { termMonths: 6, annualRateBps: 430 },
  { termMonths: 12, annualRateBps: 465 },
  { termMonths: 24, annualRateBps: 450 },
  { termMonths: 36, annualRateBps: 435 },
  { termMonths: 60, annualRateBps: 425 },
];

/** Every tenor on sale, shortest first. */
export const DEPOSIT_RATES: readonly DepositRate[] = Object.freeze(
  BOARD.map((entry) => rate(entry.termMonths, entry.annualRateBps)),
);

/**
 * Penalty applied when a deposit is broken before maturity, as a reduction in the rate.
 *
 * Expressed as a rate reduction rather than a flat charge, and applied by recalculating
 * the whole term at the lower rate. That is what makes the penalty proportionate: breaking
 * a five-year deposit after one month costs a month of the difference, not a fixed fee
 * that could exceed the interest earned.
 */
export const BREAK_PENALTY_BPS = 200;

/**
 * The rate for a tenor, or nothing if that tenor is not on sale.
 *
 * Exact match only. Interpolating between published tenors would mean quoting a rate that
 * appears nowhere on the rate board, which a customer cannot check and a regulator would
 * ask about.
 */
export function rateForTenor(termMonths: number): DepositRate | undefined {
  return DEPOSIT_RATES.find((entry) => entry.termMonths === termMonths);
}

/**
 * The rate a broken deposit is recalculated at.
 *
 * Floored at zero: a very short deposit on a low rate must not produce a negative rate and
 * a customer who gets back less than they put in. Breaking early costs the interest, never
 * the capital.
 */
export function brokenRateBps(originalRateBps: number): number {
  return Math.max(originalRateBps - BREAK_PENALTY_BPS, 0);
}

function rate(termMonths: number, annualRateBps: number): DepositRate {
  return {
    termMonths,
    annualRateBps,
    minAmount: { amount: MINIMUM_PLACEMENT_MINOR_UNITS, currency: STERLING },
    currency: STERLING,
  };
}
