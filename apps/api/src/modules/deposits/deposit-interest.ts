/**
 * Interest on a term deposit: what it earns, and what breaking it costs.
 *
 * Simple interest on an actual/365 day count, not compounded, because that is what the
 * rate board advertises and what the customer's confirmation says. Compounding a rate that
 * was quoted as simple would pay out more than the product promised, which is a pleasant
 * bug right up to the point somebody reconciles the interest expense.
 *
 * Every function is pure and takes the date it is measuring to, so the maturity job and
 * the break quote both compute the same figure from the same inputs.
 */

import { Money, RoundingMode } from '@reliance/money';

import { BPS_SCALE, DAYS_PER_YEAR, daysBetween } from '../loans/index.js';

/** What a deposit is worth if it is broken today. */
export interface BreakFigures {
  readonly principal: Money;
  /** Interest at the contracted rate for the days actually elapsed. */
  readonly interestEarned: Money;
  readonly penaltyRateBps: number;
  /** The interest clawed back: contracted interest less interest at the reduced rate. */
  readonly penaltyAmount: Money;
  /** Principal plus the recalculated interest. Never less than the principal. */
  readonly netProceeds: Money;
}

/**
 * Interest earned over a number of days at an annual rate.
 *
 * Rounded down, so a fraction of a penny stays with the bank rather than being paid out on
 * money that has not quite earned it. Over a book of deposits that is the difference
 * between the interest expense reconciling and not.
 */
export function interestFor(input: {
  principal: Money;
  annualRateBps: number;
  days: number;
}): Money {
  if (input.days <= 0 || input.annualRateBps <= 0) return Money.zero(input.principal.currency);

  return input.principal.scaleByRatio(
    BigInt(input.annualRateBps) * BigInt(input.days),
    BPS_SCALE * DAYS_PER_YEAR,
    RoundingMode.DOWN,
  );
}

/** Interest accrued from placement to a given business date. */
export function accruedTo(input: {
  principal: Money;
  annualRateBps: number;
  placedOn: string;
  asOf: string;
}): Money {
  return interestFor({
    principal: input.principal,
    annualRateBps: input.annualRateBps,
    days: daysBetween(input.placedOn, input.asOf),
  });
}

/** Interest the deposit will have earned by its maturity date. */
export function interestAtMaturity(input: {
  principal: Money;
  annualRateBps: number;
  placedOn: string;
  maturesOn: string;
}): Money {
  return interestFor({
    principal: input.principal,
    annualRateBps: input.annualRateBps,
    days: daysBetween(input.placedOn, input.maturesOn),
  });
}

/**
 * What breaking a deposit today produces.
 *
 * The penalty is not a charge added on top; it is the difference between the interest the
 * contracted rate would have paid for the elapsed days and the interest a reduced rate
 * pays for the same days. Recalculating rather than deducting is what guarantees the
 * customer can never receive less than they placed — the worst case is a deposit that
 * earned nothing.
 */
export function breakFigures(input: {
  principal: Money;
  annualRateBps: number;
  reducedRateBps: number;
  placedOn: string;
  asOf: string;
}): BreakFigures {
  const days = daysBetween(input.placedOn, input.asOf);
  const contracted = interestFor({
    principal: input.principal,
    annualRateBps: input.annualRateBps,
    days,
  });
  const reduced = interestFor({
    principal: input.principal,
    annualRateBps: input.reducedRateBps,
    days,
  });

  return {
    principal: input.principal,
    interestEarned: contracted,
    penaltyRateBps: input.annualRateBps - input.reducedRateBps,
    penaltyAmount: contracted.minus(reduced),
    netProceeds: input.principal.plus(reduced),
  };
}
