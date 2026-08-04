import { divideWithRounding, RoundingMode } from '../rounding.js';

describe('divideWithRounding', () => {
  it('rejects division by zero', () => {
    expect(() => divideWithRounding(1n, 0n)).toThrow(RangeError);
  });

  it('returns an exact quotient untouched regardless of mode', () => {
    for (const mode of Object.values(RoundingMode)) {
      expect(divideWithRounding(100n, 4n, mode)).toBe(25n);
      expect(divideWithRounding(-100n, 4n, mode)).toBe(-25n);
    }
  });

  describe.each([
    // dividend, divisor, mode, expected
    [7n, 2n, RoundingMode.DOWN, 3n],
    [7n, 2n, RoundingMode.UP, 4n],
    [7n, 2n, RoundingMode.CEILING, 4n],
    [7n, 2n, RoundingMode.FLOOR, 3n],
    [7n, 2n, RoundingMode.HALF_UP, 4n],
    [7n, 3n, RoundingMode.HALF_UP, 2n],
    [8n, 3n, RoundingMode.HALF_UP, 3n],
    [7n, 2n, RoundingMode.HALF_DOWN, 3n],
    [7n, 3n, RoundingMode.HALF_DOWN, 2n],
    [8n, 3n, RoundingMode.HALF_DOWN, 3n],
    [7n, 2n, RoundingMode.HALF_EVEN, 4n],
    [5n, 2n, RoundingMode.HALF_EVEN, 2n],
    [-7n, 2n, RoundingMode.DOWN, -3n],
    [-7n, 2n, RoundingMode.UP, -4n],
    [-7n, 2n, RoundingMode.CEILING, -3n],
    [-7n, 2n, RoundingMode.FLOOR, -4n],
    [-7n, 2n, RoundingMode.HALF_UP, -4n],
    [-7n, 2n, RoundingMode.HALF_DOWN, -3n],
    [-5n, 2n, RoundingMode.HALF_EVEN, -2n],
    [8n, 3n, RoundingMode.HALF_EVEN, 3n],
    [7n, -2n, RoundingMode.CEILING, -3n],
    [7n, -2n, RoundingMode.FLOOR, -4n],
  ])('%s / %s with %s', (dividend, divisor, mode, expected) => {
    it(`is ${expected}`, () => {
      expect(divideWithRounding(dividend, divisor, mode)).toBe(expected);
    });
  });

  it('resolves half-even ties by parity in both directions', () => {
    expect(divideWithRounding(3n, 2n, RoundingMode.HALF_EVEN)).toBe(2n); // 1.5 → odd → up
    expect(divideWithRounding(5n, 2n, RoundingMode.HALF_EVEN)).toBe(2n); // 2.5 → even → down
    expect(divideWithRounding(7n, 3n, RoundingMode.HALF_EVEN)).toBe(2n); // below the tie
    expect(divideWithRounding(-3n, 2n, RoundingMode.HALF_EVEN)).toBe(-2n);
  });

  it('defaults to banker’s rounding', () => {
    expect(divideWithRounding(5n, 2n)).toBe(2n);
    expect(divideWithRounding(7n, 2n)).toBe(4n);
  });

  it('rejects an unknown rounding mode', () => {
    expect(() => divideWithRounding(7n, 2n, 'SIDEWAYS' as unknown as RoundingMode)).toThrow(
      /Unknown rounding mode/,
    );
  });

  it('is unbiased over many ties, unlike HALF_UP', () => {
    const ties = Array.from({ length: 10 }, (_, index) => BigInt(index * 2 + 1));

    const halfEven = ties.reduce(
      (sum, tie) => sum + divideWithRounding(tie, 2n, RoundingMode.HALF_EVEN),
      0n,
    );
    const halfUp = ties.reduce(
      (sum, tie) => sum + divideWithRounding(tie, 2n, RoundingMode.HALF_UP),
      0n,
    );

    expect(halfEven).toBeLessThan(halfUp);
  });
});
