'use client';

/**
 * Reading something the browser knows and the server does not.
 *
 * Device capabilities — whether passkeys exist, what the user agent says — are external state that
 * only one of the two runtimes can see. `useSyncExternalStore` is the API for exactly that: the
 * server renders the declared fallback, the browser renders the truth, and React reconciles them
 * in one pass. Copying the value into state from an effect does the same thing a render later, and
 * flags every time as a cascading update.
 *
 * The value must be a primitive, or a stable reference. A fresh object on each read would make the
 * store look permanently changed and re-render without end.
 */

import { useSyncExternalStore } from 'react';

/** These values never change during a page's life, so there is nothing to subscribe to. */
const NEVER_CHANGES = (): (() => void) => () => undefined;

/**
 * @param read what the browser reports. Must return a primitive.
 * @param serverValue what a server render should assume.
 */
export function useBrowserValue<T extends string | number | boolean>(
  read: () => T,
  serverValue: T,
): T {
  return useSyncExternalStore(NEVER_CHANGES, read, () => serverValue);
}
