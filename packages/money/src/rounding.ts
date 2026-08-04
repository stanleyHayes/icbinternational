/**
 * Integer division with explicit rounding.
 *
 * Every place money is scaled — FX conversion, interest accrual, percentage fees — ends
 * in a division that does not come out even. Which way that remainder goes is a policy
 * decision with real financial consequence, so it is always passed explicitly. There is
 * no implicit default at the call site; the default lives in one place, here.
 */

export const RoundingMode = {
  /** Toward zero. Truncation. */
  DOWN: 'DOWN',
  /** Away from zero. */
  UP: 'UP',
  /** Toward positive infinity. */
  CEILING: 'CEILING',
  /** Toward negative infinity. */
  FLOOR: 'FLOOR',
  /** Nearest; ties away from zero. */
  HALF_UP: 'HALF_UP',
  /** Nearest; ties toward zero. */
  HALF_DOWN: 'HALF_DOWN',
  /** Nearest; ties to the even neighbour. Banker's rounding — the ledger default. */
  HALF_EVEN: 'HALF_EVEN',
} as const;

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

/**
 * Banker's rounding. Chosen as the default because over a large number of accruals it
 * is unbiased: HALF_UP systematically leaks value away from the bank (or toward it,
 * depending on sign), and at ledger scale that bias is measurable.
 */
export const DEFAULT_ROUNDING: RoundingMode = RoundingMode.HALF_EVEN;

interface DivisionParts {
  readonly quotient: bigint;
  readonly remainder: bigint;
  readonly negative: boolean;
  readonly twiceRemainder: bigint;
  readonly absDivisor: bigint;
}

function split(dividend: bigint, divisor: bigint): DivisionParts {
  const negative = dividend < 0n !== divisor < 0n;
  const absDividend = dividend < 0n ? -dividend : dividend;
  const absDivisor = divisor < 0n ? -divisor : divisor;

  return {
    quotient: absDividend / absDivisor,
    remainder: absDividend % absDivisor,
    negative,
    twiceRemainder: (absDividend % absDivisor) * 2n,
    absDivisor,
  };
}

/**
 * Given a non-exact division, decides whether the magnitude steps away from zero.
 * One predicate per mode — the table replaces a seven-branch switch and keeps each
 * policy readable on a single line.
 */
type RoundsAwayFromZero = (parts: DivisionParts) => boolean;

const ROUNDING_POLICY: Readonly<Record<RoundingMode, RoundsAwayFromZero>> = Object.freeze({
  [RoundingMode.DOWN]: () => false,
  [RoundingMode.UP]: () => true,
  [RoundingMode.CEILING]: ({ negative }) => !negative,
  [RoundingMode.FLOOR]: ({ negative }) => negative,
  [RoundingMode.HALF_UP]: ({ twiceRemainder, absDivisor }) => twiceRemainder >= absDivisor,
  [RoundingMode.HALF_DOWN]: ({ twiceRemainder, absDivisor }) => twiceRemainder > absDivisor,
  [RoundingMode.HALF_EVEN]: ({ quotient, twiceRemainder, absDivisor }) =>
    twiceRemainder > absDivisor || (twiceRemainder === absDivisor && quotient % 2n !== 0n),
});

function magnitudeAfterRounding(parts: DivisionParts, mode: RoundingMode): bigint {
  if (parts.remainder === 0n) return parts.quotient;

  const roundsAway = ROUNDING_POLICY[mode];
  if (!roundsAway) throw new RangeError(`Unknown rounding mode: ${String(mode)}`);

  return roundsAway(parts) ? parts.quotient + 1n : parts.quotient;
}

/**
 * Divides two bigints, rounding the result according to `mode`.
 *
 * @throws {RangeError} on division by zero.
 */
export function divideWithRounding(
  dividend: bigint,
  divisor: bigint,
  mode: RoundingMode = DEFAULT_ROUNDING,
): bigint {
  if (divisor === 0n) throw new RangeError('Division by zero');

  const parts = split(dividend, divisor);
  const magnitude = magnitudeAfterRounding(parts, mode);
  return parts.negative ? -magnitude : magnitude;
}
