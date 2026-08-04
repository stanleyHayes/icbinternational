/**
 * Verifying that a webhook really came from the email provider.
 *
 * The endpoint is unauthenticated by necessity — a provider cannot present a session — so
 * the signature is the *only* thing standing between the internet and the ability to mark
 * any customer's address as bounced, which would silently stop their security emails.
 * That makes this a security control, not a formality.
 *
 * Resend signs with the Svix scheme: an HMAC-SHA256 over `id.timestamp.body`, keyed by the
 * secret's base64 payload, presented as one or more space-separated `v1,<signature>` values
 * so a secret can be rotated without dropping events.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_PREFIX = 'whsec_';
const VERSION_PREFIX = 'v1,';
const MILLISECONDS_PER_SECOND = 1000;

/** Events older than this are refused, so a captured request cannot be replayed later. */
export const MAX_WEBHOOK_AGE_SECONDS = 300;

export interface WebhookHeaders {
  readonly id: string;
  readonly timestamp: string;
  readonly signature: string;
}

export type VerificationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

/**
 * Checks a webhook's signature and freshness.
 *
 * @param rawBody the request body exactly as received. Re-serialising a parsed object
 *   changes key order and whitespace, and the signature is over bytes.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  headers: WebhookHeaders;
  secret: string;
  now: Date;
}): VerificationResult {
  if (!input.secret) return { valid: false, reason: 'No webhook secret is configured.' };

  const age = ageInSeconds(input.headers.timestamp, input.now);
  if (age === null) return { valid: false, reason: 'The timestamp is not a number.' };
  if (Math.abs(age) > MAX_WEBHOOK_AGE_SECONDS) {
    return { valid: false, reason: 'The event is outside the accepted time window.' };
  }

  const key = Buffer.from(input.secret.replace(SECRET_PREFIX, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${input.headers.id}.${input.headers.timestamp}.${input.rawBody}`)
    .digest('base64');

  const presented = input.headers.signature
    .split(' ')
    .filter((entry) => entry.startsWith(VERSION_PREFIX))
    .map((entry) => entry.slice(VERSION_PREFIX.length));

  const matched = presented.some((candidate) => constantTimeEquals(candidate, expected));
  return matched ? { valid: true } : { valid: false, reason: 'The signature does not match.' };
}

function ageInSeconds(timestamp: string, now: Date): number | null {
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return null;
  return Math.floor(now.getTime() / MILLISECONDS_PER_SECOND) - sent;
}

/**
 * Compares without leaking the position of the first difference through timing.
 *
 * Length is compared first and non-constant-time, which is safe: the length of an
 * HMAC-SHA256 digest is public.
 */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
