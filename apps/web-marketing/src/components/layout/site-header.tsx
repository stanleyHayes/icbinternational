'use client';

import { usePathname } from 'next/navigation';

import { HeaderNav } from './header-nav';

/**
 * The site header.
 *
 * The mega-menu opens on click, not on hover. Hover menus are a well-documented trap for
 * anyone using a touch screen, a switch device or a tremor-affected pointer: the panel
 * appears under the finger and the link beneath it takes the tap. Click-to-open costs one
 * interaction and behaves identically for every input device.
 *
 * `key={pathname}` remounts the navigation on every route change, so a menu left open —
 * including by the browser's back button — cannot cover the page the customer just asked
 * for.
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-border bg-canvas/90 sticky top-0 z-50 border-b backdrop-blur-md">
      <HeaderNav key={pathname} />
    </header>
  );
}
