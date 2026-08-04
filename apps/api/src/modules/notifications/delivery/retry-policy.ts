/**
 * When to try again, and when to stop.
 *
 * Pure, so the schedule can be asserted exactly rather than observed approximately.
 *
 * Two distinctions do the work here. A *transient* failure — a timeout, a 503, a rate
 * limit — is worth retrying, because the message is fine and the provider is not. A
 * *permanent* one — a malformed address, a rejected recipient — is not: retrying it four
 * more times damages the sending reputation that the messages we actually need to deliver
 * depend on.
 */

import {
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BASE_SECONDS,
  RETRY_MAX_SECONDS,
} from '../notifications.constants.js';

const MILLISECONDS_PER_SECOND = 1000;
const BACKOFF_FACTOR = 2;

/** Jitter as a fraction of the delay, applied deterministically from the attempt number. */
const JITTER_STEPS = 7;
const JITTER_FRACTION_SCALE = 10;

export const FailureKind = {
  TRANSIENT: 'TRANSIENT',
  PERMANENT: 'PERMANENT',
} as const;
export type FailureKind = (typeof FailureKind)[keyof typeof FailureKind];

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly nextAttemptAt: Date | null;
}

/**
 * Delay before attempt `attemptNumber` (1-based), in seconds.
 *
 * Exponential from {@link RETRY_BASE_SECONDS}, capped at {@link RETRY_MAX_SECONDS}, with a
 * small deterministic spread so a provider outage that fails ten thousand messages at once
 * does not retry all of them in the same second. The spread is derived from the attempt
 * count rather than a random number, so the schedule is reproducible in a test.
 */
export function backoffSeconds(attemptNumber: number, seed: number): number {
  const raw = RETRY_BASE_SECONDS * BACKOFF_FACTOR ** Math.max(0, attemptNumber - 1);
  const capped = Math.min(raw, RETRY_MAX_SECONDS);
  const spread = ((seed % JITTER_STEPS) * capped) / (JITTER_STEPS * JITTER_FRACTION_SCALE);
  return Math.round(capped + spread);
}

export interface RetryInput {
  readonly attemptsMade: number;
  readonly failure: FailureKind;
  readonly now: Date;
  /** Stable per-delivery value, so the same row always jitters the same way. */
  readonly seed: number;
}

/** Whether to try again and when. */
export function decideRetry(input: RetryInput): RetryDecision {
  if (input.failure === FailureKind.PERMANENT) {
    return { shouldRetry: false, nextAttemptAt: null };
  }

  if (input.attemptsMade >= MAX_DELIVERY_ATTEMPTS) {
    return { shouldRetry: false, nextAttemptAt: null };
  }

  const delay = backoffSeconds(input.attemptsMade, input.seed);
  return {
    shouldRetry: true,
    nextAttemptAt: new Date(input.now.getTime() + delay * MILLISECONDS_PER_SECOND),
  };
}

/** Odd prime multiplier — the conventional string-hash constant. */
const HASH_MULTIPLIER = 31;

/** A stable numeric seed for a delivery id, so jitter is reproducible. */
export function seedFrom(deliveryId: string): number {
  let hash = 0;
  for (const character of deliveryId) {
    const point = character.codePointAt(0) ?? 0;
    hash = (hash * HASH_MULTIPLIER + point) % Number.MAX_SAFE_INTEGER;
  }
  return hash;
}
