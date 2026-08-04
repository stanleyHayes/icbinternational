import fc from 'fast-check';

import { allocateMinor, splitMinor } from '../allocate.js';
import { InvalidAllocationError } from '../money.errors.js';

describe('allocateMinor', () => {
  it('splits evenly when the amount divides cleanly', () => {
    expect(allocateMinor(900n, [1, 1, 1])).toEqual([300n, 300n, 300n]);
  });

  it('gives the indivisible remainder to the earliest shares', () => {
    expect(allocateMinor(1000n, [1, 1, 1])).toEqual([334n, 333n, 333n]);
  });

  it('respects weighting', () => {
    expect(allocateMinor(500n, [7, 3])).toEqual([350n, 150n]);
  });

  it('awards the remainder by largest fractional entitlement', () => {
    // 100 × 1/6 = 16.67, × 2/6 = 33.33, × 3/6 = 50.00
    expect(allocateMinor(100n, [1, 2, 3])).toEqual([17n, 33n, 50n]);
  });

  it('handles a zero-weight share', () => {
    expect(allocateMinor(100n, [0, 1])).toEqual([0n, 100n]);
  });

  it('handles negative amounts without losing a unit', () => {
    const parts = allocateMinor(-1000n, [1, 1, 1]);
    expect(parts).toEqual([-334n, -333n, -333n]);
    expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(-1000n);
  });

  it('handles zero', () => {
    expect(allocateMinor(0n, [3, 5])).toEqual([0n, 0n]);
  });

  it('rejects an empty weight list', () => {
    expect(() => allocateMinor(100n, [])).toThrow(InvalidAllocationError);
  });

  it('rejects weights that sum to zero', () => {
    expect(() => allocateMinor(100n, [0, 0])).toThrow(/sum to zero/);
  });

  it.each([[-1], [1.5], [Number.NaN]])('rejects the invalid weight %p', (weight) => {
    expect(() => allocateMinor(100n, [weight, 1])).toThrow(/non-negative integers/);
  });

  it('never loses or invents a minor unit, for any amount and weights', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -10_000_000_000n, max: 10_000_000_000n }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
        (amount, weights) => {
          fc.pre(weights.reduce((sum, weight) => sum + weight, 0) > 0);

          const parts = allocateMinor(amount, weights);
          expect(parts).toHaveLength(weights.length);
          expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(amount);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('is deterministic — the same input always yields the same split', () => {
    const first = allocateMinor(1_000_001n, [3, 3, 3, 1]);
    const second = allocateMinor(1_000_001n, [3, 3, 3, 1]);
    expect(first).toEqual(second);
  });
});

describe('splitMinor', () => {
  it('splits into equal parts', () => {
    expect(splitMinor(1000n, 4)).toEqual([250n, 250n, 250n, 250n]);
  });

  it('front-loads the remainder', () => {
    expect(splitMinor(1000n, 3)).toEqual([334n, 333n, 333n]);
  });

  it.each([[0], [-1], [2.5]])('rejects %p parts', (parts) => {
    expect(() => splitMinor(100n, parts)).toThrow(/positive integer/);
  });
});
