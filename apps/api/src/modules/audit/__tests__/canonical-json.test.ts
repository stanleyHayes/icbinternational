import { canonicalJson } from '../canonical-json.js';

describe('canonicalJson', () => {
  it('sorts object keys so insertion order cannot change the output', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 3, y: 4 } });
    const b = canonicalJson({ c: { y: 4, z: 3 }, a: 2, b: 1 });

    expect(a).toBe(b);
  });

  it('collapses undefined to null so an absent key and an explicit null agree', () => {
    expect(canonicalJson({ a: undefined })).toBe(canonicalJson({ a: null }));
  });

  it('serialises dates as ISO-8601 UTC', () => {
    expect(canonicalJson({ at: new Date('2026-01-02T03:04:05.000Z') })).toBe(
      '{"at":"2026-01-02T03:04:05.000Z"}',
    );
  });

  it('serialises bigints as their decimal string, never lossy', () => {
    expect(canonicalJson({ amount: 9007199254740993n })).toBe('{"amount":"9007199254740993"}');
  });

  it('keeps array order, because order is meaning in an array', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('handles scalars and nested structures', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(15)).toBe('15');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([{ b: [null, 'a'] }])).toBe('[{"b":[null,"a"]}]');
  });
});
