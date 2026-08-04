/**
 * A small, deterministic pseudo-random generator.
 *
 * `Math.random()` would make a generated bank different on every run, and a demonstration
 * you cannot reproduce is one you cannot debug: "the arrears screen looked wrong on
 * Tuesday" is unanswerable if Tuesday's data no longer exists. Seeded from `SIM_SEED`, the
 * same seed rebuilds byte-identical history.
 *
 * mulberry32 — 32-bit state, good enough distribution for choosing a merchant and an
 * amount, and short enough to read in one sitting. It is emphatically not for anything
 * security-related; nothing here mints a token or a key.
 */

const GOLDEN_GAMMA = 0x6d_2b_79_f5;
const MULTIPLIER_A = 15;
const MULTIPLIER_B = 61;
const SHIFT_A = 7;
const SHIFT_B = 14;
const UINT32 = 4_294_967_296;

export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashString(seed);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + GOLDEN_GAMMA) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> SHIFT_B), 1 | t);
    t = (t + Math.imul(t ^ (t >>> SHIFT_A), MULTIPLIER_B | t)) ^ t;
    return ((t ^ (t >>> MULTIPLIER_A)) >>> 0) / UINT32;
  }

  /** Uniform integer in [min, max], inclusive. */
  intBetween(min: number, max: number): number {
    if (max < min) throw new RangeError(`Empty range: ${min}..${max}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability, expressed in basis points so it stays integral. */
  chanceBps(basisPoints: number): boolean {
    const TOTAL_BPS = 10_000;
    return this.next() * TOTAL_BPS < basisPoints;
  }

  /** Uniform choice from a non-empty list. */
  pick<T>(items: readonly T[]): T {
    const chosen = items[this.intBetween(0, items.length - 1)];
    if (chosen === undefined) throw new RangeError('Cannot pick from an empty list');
    return chosen;
  }

  /**
   * Weighted choice. A merchant with weight 12 appears twelve times as often as one with
   * weight 1, which is what stops every category coming out the same size.
   */
  pickWeighted<T extends { readonly weight: number }>(items: readonly T[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) throw new RangeError('Cannot pick from zero total weight');

    let cursor = this.next() * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor <= 0) return item;
    }
    return items[items.length - 1] as T;
  }
}

/** FNV-1a. Turns a seed phrase into the generator's starting state. */
function hashString(value: string): number {
  const OFFSET_BASIS = 0x81_1c_9d_c5;
  const PRIME = 0x01_00_01_93;

  let hash = OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, PRIME);
  }
  return hash >>> 0;
}
