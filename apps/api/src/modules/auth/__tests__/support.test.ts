import { durationToSeconds } from '../support/duration.js';
import { hmacSha256Url, randomToken, secretsMatch, sha256Hex } from '../support/tokens.js';

jest.setTimeout(120_000);

describe('durationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['12h', 43_200],
    ['45s', 45],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it.each(['', '15', 'minutes', '0s', '-5m', '1w', 'm'])('rejects %j', (input) => {
    expect(() => durationToSeconds(input)).toThrow(RangeError);
  });
});

describe('randomToken', () => {
  it('is URL-safe and long enough to carry 256 bits by default', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('never repeats itself across a large batch', () => {
    const batch = new Set(Array.from({ length: 1000 }, () => randomToken()));
    expect(batch.size).toBe(1000);
  });
});

describe('sha256Hex', () => {
  it('is deterministic and hex-encoded', () => {
    expect(sha256Hex('reliance')).toBe(sha256Hex('reliance'));
    expect(sha256Hex('reliance')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});

describe('hmacSha256Url', () => {
  it('is deterministic for a secret and value', () => {
    expect(hmacSha256Url('s', 'v')).toBe(hmacSha256Url('s', 'v'));
  });

  it('changes with the secret', () => {
    expect(hmacSha256Url('one', 'v')).not.toBe(hmacSha256Url('two', 'v'));
  });
});

describe('secretsMatch', () => {
  it('accepts identical secrets', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
  });

  it('rejects different secrets, including different lengths', () => {
    expect(secretsMatch('abc', 'abd')).toBe(false);
    expect(secretsMatch('abc', 'abcd')).toBe(false);
  });
});
