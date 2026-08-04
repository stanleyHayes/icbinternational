import {
  BPS_TOTAL,
  seededChanceBps,
  seededHash,
  seededInt,
  seededPick,
  seededString,
} from '../seeded-random.js';

/**
 * The whole simulator stands on one property: a draw is a pure function of
 * `(seed, key)`. These tests pin that property down, because everything above —
 * refusals, latencies, references — is these draws wearing a suit.
 */
describe('seeded random', () => {
  it('gives the same value for the same seed and key, across calls', () => {
    expect(seededHash('reliance', 'ACH:pay_1:1:fail')).toBe(
      seededHash('reliance', 'ACH:pay_1:1:fail'),
    );
    expect(seededInt('reliance', 'k', 97)).toBe(seededInt('reliance', 'k', 97));
    expect(seededString('reliance', 'k', 12, 'AB')).toBe(seededString('reliance', 'k', 12, 'AB'));
  });

  it('changes the draw when either the seed or the key changes', () => {
    const base = seededInt('reliance', 'ACH:pay_1:1:fail', BPS_TOTAL);

    expect(seededInt('other-seed', 'ACH:pay_1:1:fail', BPS_TOTAL)).not.toBe(base);
    expect(seededInt('reliance', 'ACH:pay_2:1:fail', BPS_TOTAL)).not.toBe(base);
  });

  it('does not reshuffle one key when another key is drawn', () => {
    const before = [seededInt('s', 'a', 1000), seededInt('s', 'b', 1000)];

    seededInt('s', 'unrelated-new-key', 1000);

    expect([seededInt('s', 'a', 1000), seededInt('s', 'b', 1000)]).toEqual(before);
  });

  it('keeps integer draws inside the bound', () => {
    for (let index = 0; index < 500; index += 1) {
      const draw = seededInt('reliance', `bound-${index}`, 997);
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(997);
      expect(Number.isInteger(draw)).toBe(true);
    }
  });

  it('spreads hashes across buckets rather than clustering', () => {
    const buckets = new Set(
      Array.from({ length: 200 }, (_, index) => seededInt('reliance', `k${index}`, 10)),
    );

    expect(buckets.size).toBeGreaterThan(7);
  });

  it('makes chance monotone in the rate: a higher rate only ever adds hits', () => {
    const keys = Array.from({ length: 200 }, (_, index) => `op-${index}`);

    for (const key of keys) {
      if (seededChanceBps('reliance', key, 1000)) {
        expect(seededChanceBps('reliance', key, 5000)).toBe(true);
      }
    }
    expect(keys.some((key) => seededChanceBps('reliance', key, 5000))).toBe(true);
  });

  it('grows a string without changing its prefix', () => {
    const short = seededString('reliance', 'ref', 6, 'ABC123');

    expect(seededString('reliance', 'ref', 10, 'ABC123').startsWith(short)).toBe(true);
  });

  it('picks a member of the options, deterministically', () => {
    const options = ['R01', 'R02', 'R03'] as const;

    const picked = seededPick('reliance', 'reason', options);

    expect(options).toContain(picked);
    expect(seededPick('reliance', 'reason', options)).toBe(picked);
  });

  it('refuses degenerate inputs loudly', () => {
    expect(() => seededInt('s', 'k', 0)).toThrow(RangeError);
    expect(() => seededInt('s', 'k', -3)).toThrow(RangeError);
    expect(() => seededInt('s', 'k', Number.NaN)).toThrow(RangeError);
    expect(() => seededPick('s', 'k', [])).toThrow(RangeError);
  });
});
