/**
 * Remainder-safe allocation.
 *
 * Splitting £10.00 three ways cannot produce three equal shares. Naive division loses a
 * penny; naive rounding creates one. Both are unacceptable in a ledger, where the sum of
 * the parts must equal the whole exactly, every time.
 *
 * The largest-remainder method used here distributes the indivisible remainder one minor
 * unit at a time to the shares with the largest fractional entitlement, breaking ties by
 * position so the result is deterministic and reproducible in tests.
 */

import { InvalidAllocationError } from './money.errors.js';

interface Share {
  readonly index: number;
  readonly base: bigint;
  readonly remainder: bigint;
}

function assertValidWeights(weights: readonly number[]): bigint {
  if (weights.length === 0) throw new InvalidAllocationError('no weights supplied');

  let total = 0n;
  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new InvalidAllocationError(
        `weights must be non-negative integers, received ${String(weight)}`,
      );
    }
    total += BigInt(weight);
  }

  if (total === 0n) throw new InvalidAllocationError('weights sum to zero');
  return total;
}

function baseShares(amount: bigint, weights: readonly number[], totalWeight: bigint): Share[] {
  return weights.map((weight, index) => {
    const scaled = amount * BigInt(weight);
    return {
      index,
      base: scaled / totalWeight,
      remainder: ((scaled % totalWeight) + totalWeight) % totalWeight,
    };
  });
}

/**
 * Ranks shares by entitlement to the leftover minor units.
 * Larger fractional remainder wins; ties resolve to the earlier index.
 */
function byEntitlement(left: Share, right: Share): number {
  if (left.remainder !== right.remainder) return right.remainder > left.remainder ? 1 : -1;
  return left.index - right.index;
}

/**
 * Splits `amount` (in minor units) across `weights`, preserving the total exactly.
 *
 * @param amount Signed minor-unit amount to distribute.
 * @param weights Non-negative integer weights, one per share.
 * @returns Minor-unit shares in the same order as `weights`. Their sum equals `amount`.
 *
 * @example
 * allocateMinor(1000n, [1, 1, 1]); // [334n, 333n, 333n]
 * allocateMinor(500n,  [7, 3]);    // [350n, 150n]
 */
export function allocateMinor(amount: bigint, weights: readonly number[]): bigint[] {
  const totalWeight = assertValidWeights(weights);
  const shares = baseShares(amount, weights, totalWeight);

  const leftover = amount - shares.reduce((sum, share) => sum + share.base, 0n);
  const step = leftover < 0n ? -1n : 1n;

  // The leftover is strictly smaller than the number of shares — each share's base is
  // its exact entitlement truncated by less than one minor unit — so a single pass over
  // the ranked shares always exhausts it. No wraparound, no bounds check.
  const extraUnits = leftover < 0n ? -leftover : leftover;
  const topUp = new Set(
    [...shares]
      .sort(byEntitlement)
      .slice(0, Number(extraUnits))
      .map((share) => share.index),
  );

  return shares.map((share) => share.base + (topUp.has(share.index) ? step : 0n));
}

/**
 * Splits `amount` into `parts` as-equal-as-possible shares.
 * Earlier shares absorb the remainder, so `split(1000n, 3)` is `[334n, 333n, 333n]`.
 */
export function splitMinor(amount: bigint, parts: number): bigint[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new InvalidAllocationError(`parts must be a positive integer, received ${String(parts)}`);
  }
  return allocateMinor(
    amount,
    Array.from({ length: parts }, () => 1),
  );
}
