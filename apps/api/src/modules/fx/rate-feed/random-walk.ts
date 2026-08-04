/**
 * The market, as a seeded random walk on scaled integers.
 *
 * Three properties are deliberate.
 *
 * **It replays.** The whole walk is a pure function of a 32-bit seed and a tick count, so
 * the same seed produces the same market on every run. A bug that only shows up when
 * EUR/GBP crosses 1.17 is reproducible by seed instead of by luck.
 *
 * **It reverts.** A pure random walk eventually wanders to zero or to infinity, and a
 * bank whose yen rate has drifted to four is not a believable bank. Each step is pulled a
 * fraction of the way back to its anchor before the jitter is applied, and the result is
 * clamped to a band around that anchor, so the market moves without ever leaving the
 * plausible.
 *
 * **It never touches a float.** Rates are `bigint` values scaled by `RATE_SCALE`, and
 * every step is integer arithmetic. A rate that rounded differently on two machines would
 * make a quote unreproducible, which is the one thing a quote may not be.
 */

/** Numerical recipes LCG. Fast, deterministic and entirely adequate for a simulated tape. */
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;

/** FNV-1a 32-bit offset basis, used to mix a seed phrase into a starting state. */
const SEED_BASIS = 0x81_1c_9d_c5;

/** Parts-per-million denominator. Jitter is expressed in ppm of the current level. */
const PPM = 1_000_000n;

/** Largest single-tick move, in parts per million. 400 ppm is four basis points. */
const MAX_JITTER_PPM = 400;

/** Fraction of the gap to the anchor closed on each tick: one part in this many. */
const REVERSION_DIVISOR = 240n;

/** How far the walk may stray from its anchor, as a percentage of the anchor. */
const BAND_FLOOR_PERCENT = 88n;
const BAND_CEILING_PERCENT = 112n;
const PERCENT = 100n;

/** One state of the walk for a single currency pair. */
export interface WalkState {
  /** Current level, scaled by `RATE_SCALE`. */
  readonly value: bigint;
  /** The LCG's state. Carried forward so the sequence is continuous across steps. */
  readonly seed: number;
}

/** Advances the generator and returns the next state alongside the drawn value. */
export function nextRandom(seed: number): { seed: number; value: number } {
  const next = (Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
  return { seed: next, value: next };
}

/**
 * Turns a seed phrase and a pair into the walk's starting generator state.
 *
 * Mixed per pair so that two currencies seeded from the same phrase do not move in
 * lockstep — a market where every rate ticks up together is not a market.
 */
export function seedFor(phrase: string, pair: string): number {
  let seed = SEED_BASIS;

  for (const character of `${phrase}|${pair}`) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, LCG_MULTIPLIER) >>> 0;
  }

  return seed >>> 0;
}

/** One tick: revert a little toward the anchor, jitter, then clamp to the band. */
export function step(state: WalkState, anchor: bigint): WalkState {
  const { seed, value: draw } = nextRandom(state.seed);

  const reverted = state.value + (anchor - state.value) / REVERSION_DIVISOR;
  const jitterPpm = BigInt((draw % (2 * MAX_JITTER_PPM + 1)) - MAX_JITTER_PPM);
  const moved = reverted + (reverted * jitterPpm) / PPM;

  return { value: clampToBand(moved, anchor), seed };
}

/** Runs `ticks` steps. Callers bound `ticks`; an unbounded catch-up would stall a request. */
export function advance(state: WalkState, anchor: bigint, ticks: number): WalkState {
  let current = state;

  for (let index = 0; index < ticks; index += 1) {
    current = step(current, anchor);
  }

  return current;
}

/** Keeps the walk inside a plausible band around its anchor. */
function clampToBand(value: bigint, anchor: bigint): bigint {
  const floor = (anchor * BAND_FLOOR_PERCENT) / PERCENT;
  const ceiling = (anchor * BAND_CEILING_PERCENT) / PERCENT;

  if (value < floor) return floor;
  if (value > ceiling) return ceiling;
  return value;
}

/** Change from one level to another, in basis points. Negative means weaker. */
export function changeBps(from: bigint, to: bigint): number {
  if (from === 0n) return 0;
  const BPS = 10_000n;
  return Number(((to - from) * BPS) / from);
}

/** Exported for the tests that pin the walk's shape. */
export const WALK_LIMITS = Object.freeze({
  maxJitterPpm: MAX_JITTER_PPM,
  bandFloorPercent: Number(BAND_FLOOR_PERCENT),
  bandCeilingPercent: Number(BAND_CEILING_PERCENT),
});
