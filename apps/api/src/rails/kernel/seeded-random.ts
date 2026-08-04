/**
 * Reproducible pseudo-randomness for the simulated rails.
 *
 * A simulator that behaved differently on every run would be useless: an engineer
 * investigating "why was this payment returned?" needs the scenario to replay
 * identically, and so does a regression suite. So nothing here is stateful. Every draw
 * is a pure function of the configured seed and a key naming what is being decided —
 * the instruction id, the field, the attempt. A sequential generator would only give
 * the same stream if every draw happened in the same order, which means adding one
 * unrelated decision anywhere would silently re-roll every later decision. Keyed draws
 * cannot reshuffle.
 *
 * Integer arithmetic throughout. Floats are banned for money in this codebase and are a
 * poor idea here too: `Math.random`-style unit intervals reintroduce platform-dependent
 * rounding into a component whose entire purpose is determinism. `Math.random` itself
 * never appears in this directory — a test greps for it.
 */

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET_BASIS = 0x811c_9dc5;

/** FNV-1a 32-bit prime. */
const FNV_PRIME = 0x0100_0193;

/** SplitMix32 increment — the golden-ratio constant scaled to 32 bits. */
const SPLITMIX_GAMMA = 0x9e37_79b9;

/** SplitMix32 mixing multipliers. */
const SPLITMIX_MIX_1 = 0x21f0_aaad;
const SPLITMIX_MIX_2 = 0x735a_2d97;

/** SplitMix32 xor-shift distances. */
const SHIFT_16 = 16;
const SHIFT_15 = 15;

/** Separator between the seed and the key, so `a|bc` and `ab|c` cannot collide. */
const KEY_SEPARATOR = ' ';

/** Basis points in a whole — the scale every rate in the bank is expressed on. */
export const BPS_TOTAL = 10_000;

/**
 * Hashes a seed and a key to a 32-bit unsigned integer.
 *
 * FNV-1a for the string fold and SplitMix32 for the avalanche. FNV alone is fast but
 * has poor diffusion in the low bits, which would make `value % 2` correlate with the
 * last character of the key — exactly the kind of hidden structure that makes a
 * simulator's decisions look plausible while being systematically wrong.
 */
export function seededHash(seed: string, key: string): number {
  const source = `${seed}${KEY_SEPARATOR}${key}`;
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), FNV_PRIME);
  }

  return splitmix32(hash);
}

/**
 * A value in `[0, boundExclusive)`, deterministic for the seed and key.
 *
 * @throws {RangeError} When the bound is not a positive integer — a caller asking for a
 *   draw below zero has a bug, and returning zero would hide it.
 */
export function seededInt(seed: string, key: string, boundExclusive: number): number {
  if (!Number.isInteger(boundExclusive) || boundExclusive <= 0) {
    throw new RangeError(`Bound must be a positive integer, received ${boundExclusive}`);
  }

  return seededHash(seed, key) % boundExclusive;
}

/**
 * Whether a chance expressed in basis points comes up.
 *
 * Basis points rather than a fraction because every rate in this system is already
 * expressed that way (`SIM_RAIL_FAILURE_BPS`, interchange, FX spreads), and because
 * integers keep the draw exactly reproducible.
 */
export function seededChanceBps(seed: string, key: string, chanceBps: number): boolean {
  return seededInt(seed, key, BPS_TOTAL) < chanceBps;
}

/**
 * A run of characters drawn from `alphabet`, deterministic for the seed and key.
 *
 * Each position is drawn from its own hash rather than successive bits of one, so
 * lengthening the run leaves the leading characters unchanged. That property is what
 * lets a reference format grow without invalidating identifiers already recorded.
 */
export function seededString(seed: string, key: string, length: number, alphabet: string): string {
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(seededInt(seed, `${key}#${index}`, alphabet.length));
  }

  return output;
}

/**
 * A value from `options`, deterministic for the seed and key.
 *
 * @throws {RangeError} When `options` is empty.
 */
export function seededPick<T>(seed: string, key: string, options: readonly T[]): T {
  const chosen = options[seededInt(seed, key, options.length)];
  if (chosen === undefined) throw new RangeError('Cannot pick from an empty set of options');
  return chosen;
}

/** The SplitMix32 finaliser: one increment, two multiply-xorshift rounds. */
function splitmix32(input: number): number {
  let state = (input + SPLITMIX_GAMMA) | 0;
  state = Math.imul(state ^ (state >>> SHIFT_16), SPLITMIX_MIX_1);
  state = Math.imul(state ^ (state >>> SHIFT_15), SPLITMIX_MIX_2);
  return (state ^ (state >>> SHIFT_16)) >>> 0;
}
