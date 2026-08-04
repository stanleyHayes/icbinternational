import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generation and comparison of opaque bearer secrets.
 *
 * Refresh tokens, CSRF tokens and recovery codes are all "a lump of entropy the server
 * later has to recognise". They share these three primitives so that none of them can end
 * up with a weaker random source or a leaky comparison by being written separately.
 */

/** 256 bits — the point past which guessing is not the attack anyone would choose. */
const DEFAULT_TOKEN_BYTES = 32;

/** Cryptographically random, URL-safe, and therefore also cookie- and header-safe. */
export function randomToken(byteLength: number = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * SHA-256, hex encoded.
 *
 * Correct for hashing high-entropy generated tokens and wrong for hashing passwords: it is
 * fast on purpose, which is a virtue against a 256-bit random string and a fatal flaw
 * against a human-chosen one. Passwords go to `PasswordService` and Argon2id instead.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * HMAC-SHA256, base64url encoded.
 *
 * Used to sign values the server hands out and later reads back from an untrusted client —
 * a CSRF cookie, say — where the point is not secrecy but proof that the value was minted
 * here and has not been edited or forged.
 */
export function hmacSha256Url(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

/**
 * Compares two secrets without leaking their common prefix through timing.
 *
 * Both sides are hashed first so that `timingSafeEqual` always sees equal-length buffers;
 * comparing raw strings of different lengths throws, and guarding that with a length check
 * would itself reveal the length of the expected value.
 */
export function secretsMatch(left: string, right: string): boolean {
  const a = createHash('sha256').update(left, 'utf8').digest();
  const b = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(a, b);
}
