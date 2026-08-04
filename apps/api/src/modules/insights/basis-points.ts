import { BASIS_POINTS_SCALE } from './insights.constants.js';

/**
 * Integer share arithmetic.
 *
 * Every proportion this module reports leaves as an integer number of basis points. A
 * float share of someone's money is the same mistake as a float amount of it — and it is
 * a mistake with a visible symptom: percentages that do not add up to a hundred on a pie
 * chart, which customers notice and report as a bug in their balance.
 */

/**
 * Splits 10,000 basis points across weights so the parts sum to exactly 10,000.
 *
 * Largest-remainder: floor every share, then hand the leftover points one at a time to
 * whoever lost the most in the rounding. Naive rounding leaves a chart summing to 9,997
 * or 10,002; this cannot, because the leftover is defined as the difference and is always
 * fully distributed.
 *
 * A total of zero produces all zeros rather than dividing by it — an empty month has no
 * shares, not undefined ones.
 */
export function allocateBasisPoints(weights: readonly bigint[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0n);
  if (total <= 0n) return weights.map(() => 0);

  const scale = BigInt(BASIS_POINTS_SCALE);
  const floors = weights.map((weight) => (weight * scale) / total);
  const remainders = weights.map((weight, index) => ({
    index,
    remainder: (weight * scale) % total,
  }));

  const distributed = floors.reduce((sum, share) => sum + share, 0n);
  let leftover = Number(scale - distributed);

  const shares = floors.map((share) => Number(share));
  // Ties broken by index, so the same input always produces the same output. A share that
  // moves between two categories on a page refresh reads as a bug in the numbers.
  const byRemainder = [...remainders].sort(
    (left, right) => compareBigInt(right.remainder, left.remainder) || left.index - right.index,
  );

  for (const candidate of byRemainder) {
    if (leftover <= 0) break;
    shares[candidate.index] = (shares[candidate.index] ?? 0) + 1;
    leftover -= 1;
  }

  return shares;
}

/**
 * Period-over-period change, in basis points, signed.
 *
 * Null when the previous period had no spend in this category: the change from nothing to
 * something is not a percentage, and reporting it as `+10000%` or as `0` would both be
 * lies. The client renders null as "new".
 *
 * Unbounded above on purpose — tripling a category's spend is `+20000` bps and the
 * customer needs to see that, not a value clamped to 100%.
 */
export function changeInBasisPoints(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;

  const scale = BigInt(BASIS_POINTS_SCALE);
  // Truncation toward zero is deliberate: a change is never rounded away from "no change".
  return Number(((current - previous) * scale) / abs(previous));
}

/**
 * How much of a limit has been used, in basis points.
 *
 * Not capped at 10,000. A budget that has been overspent by half reports 15,000, and a
 * client that wants to draw a bar clamps it for display — the number itself must stay
 * honest, because "100%" and "150%" call for different words on the screen.
 */
export function utilisationInBasisPoints(spent: bigint, limit: bigint): number {
  if (limit <= 0n) return 0;
  return Number((spent * BigInt(BASIS_POINTS_SCALE)) / limit);
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}
