'use client';

/**
 * The bottom bar, below `lg`.
 *
 * Five destinations, because that is what a thumb can reach without the bar becoming a row of
 * targets too narrow to hit reliably. Everything else lives behind the menu in the top bar.
 *
 * `env(safe-area-inset-bottom)` keeps the row clear of the home indicator on a modern phone —
 * without it the last few pixels of every tap target are unreachable.
 */

import { usePathname } from 'next/navigation';

import { isCurrent, MOBILE_NAV } from '@/lib/nav';

import { MobileNavLink } from './nav-link';

/** The fixed bottom navigation bar. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch gap-1 px-2 py-1">
        {MOBILE_NAV.map((item) => (
          <li key={item.key} className="flex flex-1">
            <MobileNavLink item={item} current={isCurrent(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
