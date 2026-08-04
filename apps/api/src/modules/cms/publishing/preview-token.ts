/**
 * Preview tokens.
 *
 * A reviewer needs to see an unpublished page rendered by the real marketing site, which
 * means the public API has to serve it — and that is the one hole in "the public API only
 * serves published content". The hole is closed by making the token a signed capability:
 * it names one document, expires, and cannot be extended or pointed at another document
 * without the signing key.
 *
 * Deliberately *not* a stored token. A signed value needs no lookup, cannot be enumerated
 * from a collection, and expires without a sweep. The trade-off is that it cannot be
 * revoked individually — rotating the key revokes all of them, which for a preview link
 * with an hour's life is the right shape of answer.
 *
 * Pure, so the expiry and tamper cases can be tested against a fixed clock.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { PREVIEW_TOKEN_TTL_SECONDS } from '../cms.constants.js';

const MILLISECONDS_PER_SECOND = 1000;
const SEPARATOR = '.';
const TOKEN_PARTS = 2;

/**
 * The one message a malformed or forged token gets.
 *
 * Identical whatever went wrong, so a caller probing the endpoint learns nothing about
 * which part of their guess was closer.
 */
const UNUSABLE = 'That preview link is not valid.';

export type PreviewCheck =
  | { readonly valid: true; readonly documentId: string }
  | { readonly valid: false; readonly reason: string };

/** Mints a token for one document, valid for {@link PREVIEW_TOKEN_TTL_SECONDS}. */
export function mintPreviewToken(input: {
  documentId: string;
  secret: string;
  issuedAt: Date;
}): string {
  const expiresAt =
    Math.floor(input.issuedAt.getTime() / MILLISECONDS_PER_SECOND) + PREVIEW_TOKEN_TTL_SECONDS;

  const payload = Buffer.from(`${input.documentId}:${expiresAt}`, 'utf8').toString('base64url');
  return `${payload}${SEPARATOR}${sign(payload, input.secret)}`;
}

/**
 * Checks a token and reports which document it authorises.
 *
 * The signature is verified *before* the payload is trusted for anything, including the
 * expiry — an unverified payload's expiry is whatever the caller wrote in it.
 */
export function verifyPreviewToken(input: {
  token: string;
  secret: string;
  now: Date;
}): PreviewCheck {
  const parts = input.token.split(SEPARATOR);
  if (parts.length !== TOKEN_PARTS) return { valid: false, reason: UNUSABLE };

  const [payload, signature] = parts;
  if (!payload || !signature) return { valid: false, reason: UNUSABLE };

  if (!constantTimeEquals(signature, sign(payload, input.secret))) {
    return { valid: false, reason: UNUSABLE };
  }

  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf(':');
  const documentId = decoded.slice(0, separator);
  const expiresAt = Number(decoded.slice(separator + 1));

  if (!documentId || !Number.isFinite(expiresAt)) {
    return { valid: false, reason: UNUSABLE };
  }

  if (expiresAt * MILLISECONDS_PER_SECOND <= input.now.getTime()) {
    return { valid: false, reason: 'That preview link has expired. Ask for a new one.' };
  }

  return { valid: true, documentId };
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
