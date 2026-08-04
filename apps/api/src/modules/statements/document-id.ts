/**
 * The encoding behind derived document identifiers.
 *
 * Statements and letters are summaries of records the bank already holds, so neither has
 * a row of its own to carry an identifier. Instead the identifier *is* the description:
 * a fixed-width Crockford base-32 field holding what the document covers, laid out like a
 * ULID so it still sorts by time and still matches the contract's `PREFIXED_ID_PATTERN`.
 *
 * Crockford's alphabet excludes I, L, O and U, which is exactly the set the contract's
 * pattern excludes — so anything encoded here is a well-formed public identifier by
 * construction rather than by a test that remembers to check.
 */

import { createHash } from 'node:crypto';

/** Crockford base-32, in value order. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const BITS_PER_CHARACTER = 5n;
const CHARACTER_MASK = 31n;

/** Characters carrying the timestamp, as in a ULID. */
export const TIME_CHARACTERS = 10;
/** Characters carrying the document's own fields. */
export const PAYLOAD_CHARACTERS = 16;

/** Bits of the account digest folded into every identifier. */
export const TAG_BITS = 36n;
const TAG_MASK = (1n << TAG_BITS) - 1n;
const TAG_HEX_DIGITS = 9;

/** Left-pads `value` into exactly `width` base-32 characters. */
export function encodeBase32(value: bigint, width: number): string {
  let remaining = value;
  let out = '';

  for (let position = 0; position < width; position += 1) {
    out = `${ALPHABET[Number(remaining & CHARACTER_MASK)]}${out}`;
    remaining >>= BITS_PER_CHARACTER;
  }

  return out;
}

/** Reads base-32 back, or null if the text contains anything outside the alphabet. */
export function decodeBase32(text: string): bigint | null {
  let value = 0n;

  for (const character of text) {
    const digit = ALPHABET.indexOf(character);
    if (digit === -1) return null;
    value = (value << BITS_PER_CHARACTER) | BigInt(digit);
  }

  return value;
}

/**
 * Thirty-six bits of SHA-256 over the account id: enough to bind, too little to invert.
 *
 * This is what stops one customer's document identifier resolving under another's
 * account. The check runs before anything is read, so a replayed identifier fails to
 * decode and the route answers 404 — the same answer an identifier for nothing gets.
 */
export function accountTag(accountId: string): bigint {
  const digest = createHash('sha256').update(accountId).digest('hex');
  return BigInt(`0x${digest.slice(0, TAG_HEX_DIGITS)}`) & TAG_MASK;
}

/** Splits `prefix_body` and returns the body only when it is the expected width. */
export function identifierBody(id: string, prefix: string): string | null {
  if (!id.startsWith(`${prefix}_`)) return null;

  const body = id.slice(prefix.length + 1);
  return body.length === TIME_CHARACTERS + PAYLOAD_CHARACTERS ? body : null;
}

/** Mask for a field of `bits` bits. */
export function maskOf(bits: bigint): bigint {
  return (1n << bits) - 1n;
}
