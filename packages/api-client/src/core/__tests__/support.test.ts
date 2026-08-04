/**
 * Cookies, query building and idempotency helpers.
 */

import { COOKIE } from '@reliance/contracts';

import { cookieHeaderReader, parseCookieHeader } from '../cookies.js';
import { newIdempotencyKey, withIdempotencyKey, withStepUpToken } from '../idempotency.js';
import { buildQueryString, joinUrl } from '../query.js';

describe('cookies', () => {
  it('reads a named cookie out of a header', () => {
    const read = cookieHeaderReader('rb.at=opaque; rb.csrf=token-1; rb.did=device');

    expect(read(COOKIE.csrf)).toBe('token-1');
    expect(read('missing')).toBeNull();
  });

  it('decodes percent-encoded values', () => {
    expect(cookieHeaderReader('rb.csrf=a%20b')(COOKIE.csrf)).toBe('a b');
  });

  it('falls back to the raw value when a cookie is not valid encoding', () => {
    expect(cookieHeaderReader('rb.csrf=%E0%A4%A')(COOKIE.csrf)).toBe('%E0%A4%A');
  });

  it('parses a whole header into a record', () => {
    expect(parseCookieHeader('a=1; b=2=3')).toEqual({ a: '1', b: '2=3' });
  });
});

describe('buildQueryString', () => {
  it('returns an empty string when nothing survives', () => {
    expect(buildQueryString()).toBe('');
    expect(buildQueryString({ a: undefined, b: null })).toBe('');
  });

  it('repeats a key for array values', () => {
    expect(buildQueryString({ id: ['a', 'b'] })).toBe('?id=a&id=b');
  });

  it('serialises numbers and booleans', () => {
    expect(buildQueryString({ limit: 25, unreadOnly: true })).toBe('?limit=25&unreadOnly=true');
  });
});

describe('joinUrl', () => {
  it('joins without doubling or dropping slashes', () => {
    expect(joinUrl('https://api.test/', '/v1/accounts')).toBe('https://api.test/v1/accounts');
    expect(joinUrl('https://api.test', 'v1/accounts')).toBe('https://api.test/v1/accounts');
  });

  it('keeps a path prefix on the base, which `new URL` would discard', () => {
    expect(joinUrl('https://host/api', '/v1/accounts')).toBe('https://host/api/v1/accounts');
  });
});

describe('idempotency helpers', () => {
  it('mints a distinct key each time', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it('adds a key when none is present', () => {
    expect(withIdempotencyKey().idempotencyKey).toEqual(expect.any(String));
  });

  it('keeps a caller-supplied key, so a retry reuses it', () => {
    const first = withIdempotencyKey();
    const second = withIdempotencyKey(first);

    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('preserves other options while adding the key', () => {
    const controller = new AbortController();
    const options = withIdempotencyKey({ signal: controller.signal });

    expect(options.signal).toBe(controller.signal);
  });

  it('attaches a step-up token', () => {
    expect(withStepUpToken('grant-1').stepUpToken).toBe('grant-1');
  });
});
