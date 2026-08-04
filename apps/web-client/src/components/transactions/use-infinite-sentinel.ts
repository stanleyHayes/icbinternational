'use client';

/**
 * The element that, when it scrolls into view, asks for the next page.
 *
 * Deliberately paired with a real button in the markup rather than replacing it. An intersection
 * observer never fires for somebody navigating by keyboard or by screen-reader heading, so a list
 * that only auto-loads is a list that ends at row twenty-five for exactly the people least able
 * to work out why.
 *
 * The margin means the request starts while the sentinel is still below the fold, so the rows are
 * usually there before the customer reaches the gap.
 */

import { useEffect, useRef, type RefObject } from 'react';

/** How far below the viewport the next page starts loading. */
const PREFETCH_MARGIN = '400px';

/**
 * Watches for the end of the list.
 *
 * @param enabled false once the list is exhausted or a page is already in flight.
 * @param onReached called when the sentinel enters the prefetch margin.
 */
export function useInfiniteSentinel(
  enabled: boolean,
  onReached: () => void,
): RefObject<HTMLDivElement | null> {
  const sentinel = useRef<HTMLDivElement>(null);
  const handler = useRef(onReached);

  // Kept in an effect rather than assigned during render: a ref written while rendering is a
  // side effect React is allowed to discard, and the callback would silently go stale.
  useEffect(() => {
    handler.current = onReached;
  }, [onReached]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handler.current();
      },
      { rootMargin: PREFETCH_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return sentinel;
}
