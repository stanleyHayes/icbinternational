'use client';

/**
 * Combines a forwarded ref with a ref the component needs for itself.
 *
 * Components that must touch their own DOM node — setting `indeterminate` on a checkbox, focusing
 * an OTP box — still have to hand that node to the caller. Silently dropping the forwarded ref is
 * the bug that makes a component unusable with a form library.
 */

import { type Ref, type RefCallback } from 'react';

/**
 * Returns a callback ref that assigns the node to every ref given.
 *
 * Deliberately **not** wrapped in `useCallback`. The ref list is variadic, so its dependency array
 * could only ever be a spread — and the React compiler cannot verify a non-literal dependency
 * list, which is exactly what it reports when it rejects `useCallback(fn, refs)`. Memoising would
 * buy little in any case: React calls a changed ref callback with `null` and then the node, so an
 * unstable identity costs one extra pair of calls per render and never produces a wrong result.
 * The compiler memoises the surrounding component; this stays plain and correct.
 */
export function useMergedRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) assignRef(ref, node);
  };
}

/**
 * Assigns a node to one ref, whichever form it takes.
 *
 * Writing `ref.current` mutates something that arrived as a prop, which the React compiler flags
 * on sight — correctly, in general. Refs are the documented exception: a mutable `current` box is
 * the entire point of the API. Isolating the write in one small function keeps that exception in
 * a single place with a reason attached, rather than scattered through every hook that needs it.
 */
function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') {
    ref(node);
    return;
  }
  if (!ref) return;

  // eslint-disable-next-line no-param-reassign -- a ref's `current` exists to be written
  (ref as { current: T | null }).current = node;
}
