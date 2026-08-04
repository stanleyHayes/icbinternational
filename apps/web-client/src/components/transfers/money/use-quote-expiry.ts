'use client';

/**
 * How long a quoted price has left.
 *
 * A quote is a promise with a deadline. The customer must be able to see the deadline, and the
 * interface must make it impossible to act after it — an expired quote submitted anyway is either
 * refused by the API, which wastes the customer's time, or honoured at today's rate, which is
 * worse.
 *
 * Driven by the shell's shared per-second store, so one interval serves every countdown on the
 * page. The window is measured from the moment the quote arrived rather than from the device's
 * idea of "now", because a laptop whose clock is a day out would otherwise show a live quote as
 * dead on arrival. The API remains the authority on whether the quote is still good; this only
 * decides what the customer is allowed to press.
 */

import { useSyncExternalStore } from 'react';

import { currentSecond, serverSecond, subscribeToSeconds } from '@/lib/tick';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** Shortest quote window that could be genuine. */
const MIN_WINDOW_SECONDS = 5;

/** Longest quote window that could be genuine. */
const MAX_WINDOW_SECONDS = 1800;

/** Used when the device's clock and the bank's plainly disagree. */
const FALLBACK_WINDOW_SECONDS = 60;

/** Below this, the countdown is styled as urgent and announced politely. */
export const QUOTE_URGENT_SECONDS = 15;

/** A quote's timing, as this browser recorded it. */
export interface QuoteTiming {
  /** The bank's expiry, as an ISO-8601 instant. */
  readonly expiresAt: string;
  /** Local milliseconds at the moment the quote arrived. */
  readonly receivedAtMs: number;
}

/** What {@link useQuoteExpiry} hands back. */
export interface QuoteExpiry {
  /** Whole seconds left, floored at zero. Meaningless until `known`. */
  readonly remaining: number;
  /** True once the quote can no longer be acted on. */
  readonly expired: boolean;
  /** False during the server render, when there is no clock to count against. */
  readonly known: boolean;
  /** `0:47`, ready to render. */
  readonly label: string;
  /** True inside the last few seconds, where the interface should say so. */
  readonly urgent: boolean;
}

function windowSeconds(timing: QuoteTiming): number {
  const expiry = new Date(timing.expiresAt).getTime();
  if (Number.isNaN(expiry)) return FALLBACK_WINDOW_SECONDS;

  const span = Math.round((expiry - timing.receivedAtMs) / MS_PER_SECOND);
  const plausible = span >= MIN_WINDOW_SECONDS && span <= MAX_WINDOW_SECONDS;
  return plausible ? span : FALLBACK_WINDOW_SECONDS;
}

/** `m:ss`, the shape a countdown is read in. */
export function countdownLabel(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** @param timing the quote's expiry and arrival, or `undefined` when there is no quote. */
export function useQuoteExpiry(timing: QuoteTiming | undefined): QuoteExpiry {
  const second = useSyncExternalStore(subscribeToSeconds, currentSecond, serverSecond);

  if (second === 0 || !timing) {
    return { remaining: 0, expired: false, known: false, label: countdownLabel(0), urgent: false };
  }

  const deadline = Math.floor(timing.receivedAtMs / MS_PER_SECOND) + windowSeconds(timing);
  const remaining = Math.max(0, deadline - second);

  return {
    remaining,
    expired: remaining === 0,
    known: true,
    label: countdownLabel(remaining),
    urgent: remaining > 0 && remaining <= QUOTE_URGENT_SECONDS,
  };
}
