import type { ReactNode } from 'react';

/**
 * The page's enter transition on route change.
 *
 * A template remounts on every navigation where a layout does not, which makes it the one
 * per-navigation mount hook the App Router offers. The wrapper is a motion-only boundary:
 * no margin, padding or width, and `motion-safe:` leaves reduced-motion users with a plain
 * swap. There is no exit animation — the App Router cannot delay the outgoing tree, and an
 * enter-only transition is the correct trade.
 */
export default function Template({ children }: { readonly children: ReactNode }) {
  return <div className="motion-safe:animate-page-enter">{children}</div>;
}
