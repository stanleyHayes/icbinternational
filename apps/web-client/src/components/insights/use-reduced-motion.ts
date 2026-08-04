'use client';

/**
 * Whether the customer has asked their device to reduce motion.
 *
 * Charts animate on mount by default, which for a page of four of them is a lot of movement at
 * once. For somebody with a vestibular disorder that is not decoration, it is nausea, so the
 * preference is honoured by drawing the charts in their final state immediately.
 *
 * `useSyncExternalStore` rather than an effect: the preference is external state that can change
 * while the page is open, and the server snapshot is deliberately `true` so the first paint is
 * still, whatever the device turns out to prefer.
 */

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = globalThis.matchMedia?.(QUERY);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

function read(): boolean {
  return globalThis.matchMedia?.(QUERY).matches ?? false;
}

/** A render on the server has no device to ask, and stillness is the safe default. */
function readServer(): boolean {
  return true;
}

/** True when animation should be suppressed. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** The `isAnimationActive` value a chart should pass, given the preference. */
export function useChartAnimation(): boolean {
  return !useReducedMotion();
}
