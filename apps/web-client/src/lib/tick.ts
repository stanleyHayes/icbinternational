'use client';

/**
 * A once-a-second clock, as a subscribable store.
 *
 * Countdowns need the current time to *change*, which makes it external state rather than
 * component state: `useSyncExternalStore` over this is a subscription, where `setInterval` plus
 * `setState` is a cascading render every second for every countdown on the page.
 *
 * One interval serves every subscriber, and it stops when the last one goes away.
 */

import { nowMs } from './clock';

const MS_PER_SECOND = 1000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to the passing of each second. */
export function subscribeToSeconds(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= globalThis.setInterval(tick, MS_PER_SECOND);

  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0 || timer === undefined) return;
    globalThis.clearInterval(timer);
    timer = undefined;
  };
}

/** Whole seconds since the epoch. Stable for the whole of each second, as the store requires. */
export function currentSecond(): number {
  return Math.floor(nowMs() / MS_PER_SECOND);
}

/**
 * What a server render sees: nothing.
 *
 * Zero is the sentinel for "the clock is not known yet". A server that answered with its own time
 * would produce a countdown one second out from the browser's and a hydration mismatch on the
 * first paint of every screen that shows one.
 */
export function serverSecond(): number {
  return 0;
}
