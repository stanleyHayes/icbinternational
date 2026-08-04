'use client';

/**
 * How long a challenge has left.
 *
 * Driven by the shared per-second store, so the customer is watching their own device's clock —
 * the honest one for a countdown.
 *
 * The subtlety is clock skew. The expiry comes from the bank; "now" comes from the device; and a
 * laptop whose clock is a day out would make a live challenge look dead the moment it arrived. So
 * the window is derived once, from the gap between the expiry and the moment the challenge was
 * received, and then counted down locally. A gap that is not plausible — negative, or absurdly
 * long — means the two clocks disagree, and the standard window is used instead. A customer with a
 * wrong clock gets a slightly generous countdown; the API remains the thing that decides whether
 * the code is still good.
 */

import { useSyncExternalStore } from 'react';

import { currentSecond, serverSecond, subscribeToSeconds } from '@/lib/tick';

const MS_PER_SECOND = 1000;

/** Shortest window that could be genuine. */
const MIN_WINDOW_SECONDS = 30;

/** Longest window that could be genuine. */
const MAX_WINDOW_SECONDS = 1800;

/** Used when the device's clock and the bank's disagree. */
const FALLBACK_WINDOW_SECONDS = 600;

/** What {@link useChallengeCountdown} hands back. */
export interface Countdown {
  /** Whole seconds left, floored at zero. Meaningless until `known`. */
  readonly remaining: number;
  /** True once there is nothing left and the challenge can no longer be answered. */
  readonly expired: boolean;
  /** False during the server render, when there is no clock to count against. */
  readonly known: boolean;
}

/** The challenge's own timing, as this browser recorded it. */
export interface ChallengeTiming {
  /** The bank's expiry, as an ISO-8601 instant. */
  readonly expiresAt: string;
  /** Local milliseconds at the moment the challenge arrived. */
  readonly receivedAtMs: number;
}

function windowSeconds(timing: ChallengeTiming): number {
  const expiry = new Date(timing.expiresAt).getTime();
  if (Number.isNaN(expiry)) return FALLBACK_WINDOW_SECONDS;

  const span = Math.round((expiry - timing.receivedAtMs) / MS_PER_SECOND);
  const plausible = span >= MIN_WINDOW_SECONDS && span <= MAX_WINDOW_SECONDS;
  return plausible ? span : FALLBACK_WINDOW_SECONDS;
}

/** @param timing the challenge's expiry and arrival, or `undefined` when there is no challenge. */
export function useChallengeCountdown(timing: ChallengeTiming | undefined): Countdown {
  const second = useSyncExternalStore(subscribeToSeconds, currentSecond, serverSecond);
  if (second === 0 || !timing) return { remaining: 0, expired: false, known: false };

  const deadline = Math.floor(timing.receivedAtMs / MS_PER_SECOND) + windowSeconds(timing);
  const remaining = Math.max(0, deadline - second);
  return { remaining, expired: remaining === 0, known: true };
}
