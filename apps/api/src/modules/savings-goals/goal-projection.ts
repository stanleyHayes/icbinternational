/**
 * Will this customer get there, and what would it take?
 *
 * Three pure figures: how far along they are, what they would have to put aside each month
 * from here, and whether the pace they have actually managed so far is enough. The third
 * is the one that matters — a progress bar tells a customer where they are, and only a
 * comparison of paces tells them whether they are going to make it.
 */

import { Money, RoundingMode } from '@reliance/money';

import { monthsBetween } from '../loans/index.js';

import { BPS_SCALE, ON_TRACK_TOLERANCE_BPS } from './goal.constants.js';

/** Everything a goal card shows about progress. */
export interface GoalProjection {
  /** How much of the target has been saved, in basis points, capped at 100%. */
  readonly progressBps: number;
  /** What is still to find. Zero once the target is met. */
  readonly shortfall: Money;
  /**
   * What the customer needs to put aside monthly to hit the deadline.
   *
   * Null when there is no deadline, because "per month" has no meaning without one, and
   * null rather than zero so the card can say "no date set" instead of "£0 a month".
   */
  readonly suggestedMonthlyContribution: Money | null;
  /** Whether the pace so far will get there by the deadline. True when there is no deadline. */
  readonly onTrack: boolean;
  /** Whether the target has been reached. */
  readonly complete: boolean;
}

/** What the projection needs. */
export interface ProjectionRequest {
  readonly target: Money;
  readonly current: Money;
  /** Calendar date the goal was opened; the pace so far is measured from here. */
  readonly startedOn: string;
  readonly targetDate: string | null;
  readonly asOf: string;
}

/**
 * Projects a goal forward from where it actually is.
 *
 * A goal past its deadline and short of its target is never "on track", whatever the pace
 * suggests. That case is checked first, because dividing a shortfall by nought months
 * remaining is both undefined and a way to tell somebody they need to save infinity.
 */
export function projectGoal(request: ProjectionRequest): GoalProjection {
  const shortfall = remaining(request.target, request.current);
  const complete = !shortfall.isPositive;

  return {
    progressBps: progressBps(request.target, request.current),
    shortfall,
    suggestedMonthlyContribution: monthlyContribution(request, shortfall),
    onTrack: complete || isOnTrack(request, shortfall),
    complete,
  };
}

/** How far along a goal is, in basis points, capped at 100%. */
export function progressBps(target: Money, current: Money): number {
  if (!target.isPositive) return Number(BPS_SCALE);
  if (!current.isPositive) return 0;

  const raw = (current.amount * BPS_SCALE) / target.amount;
  return Number(raw > BPS_SCALE ? BPS_SCALE : raw);
}

/**
 * What is left to save.
 *
 * Floored at zero: a customer who has overshot their target has no shortfall, and a
 * negative one would render as a suggestion to withdraw.
 */
export function remaining(target: Money, current: Money): Money {
  const gap = target.minus(current);
  return gap.isPositive ? gap : Money.zero(target.currency);
}

/**
 * The monthly contribution that clears the shortfall by the deadline.
 *
 * Rounded up, so following the suggestion always arrives at or above the target rather
 * than a few pence short in the final month.
 */
function monthlyContribution(request: ProjectionRequest, shortfall: Money): Money | null {
  if (!request.targetDate) return null;
  if (!shortfall.isPositive) return Money.zero(shortfall.currency);

  const months = monthsBetween(request.asOf, request.targetDate);
  if (months <= 0) return shortfall;

  return shortfall.scaleByRatio(1n, BigInt(months), RoundingMode.UP);
}

/**
 * Whether the pace so far will get there.
 *
 * Compares what the customer has managed per month with what they now need per month, and
 * allows a small tolerance so a goal does not flip to "behind" on the first month a
 * standing order lands a day late.
 */
function isOnTrack(request: ProjectionRequest, shortfall: Money): boolean {
  if (!request.targetDate) return true;
  if (request.asOf >= request.targetDate) return false;

  const elapsed = Math.max(monthsBetween(request.startedOn, request.asOf), 1);
  const remainingMonths = Math.max(monthsBetween(request.asOf, request.targetDate), 1);

  const achievedPace = request.current.scaleByRatio(1n, BigInt(elapsed), RoundingMode.DOWN);
  const neededPace = shortfall.scaleByRatio(1n, BigInt(remainingMonths), RoundingMode.UP);
  const tolerance = neededPace.scaleByRatio(ON_TRACK_TOLERANCE_BPS, BPS_SCALE, RoundingMode.UP);

  return achievedPace.plus(tolerance).greaterThanOrEqual(neededPace);
}
