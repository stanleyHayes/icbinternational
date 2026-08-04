'use client';

/**
 * The links across the top of a section that has more than one screen.
 *
 * A real `<nav>` with `aria-current="page"` on the active link, not a tab strip. The distinction
 * matters: these change the URL, so they must be links — a tab that navigates breaks the back
 * button and cannot be opened in a new window, and a screen reader announces it as a tab when it
 * is in fact a page change.
 */

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn, FOCUS_RING } from '@reliance/ui';

/** One destination in a section's navigation. */
export interface SubNavItem {
  readonly href: Route;
  readonly label: string;
  /** Match the path exactly. Use on a section's index, which would otherwise claim every child. */
  readonly exact?: boolean;
}

/** Props for {@link SubNav}. */
export interface SubNavProps {
  /** Names the group — "Payments sections". Never just "Navigation". */
  readonly label: string;
  readonly items: readonly SubNavItem[];
  readonly className?: string;
}

function isActive(pathname: string, item: SubNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * @example <SubNav label="Payments sections" items={PAYMENT_SECTIONS} />
 */
export function SubNav({ label, items, className }: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className={cn('overflow-x-auto', className)}>
      <ul className="border-border flex min-w-max items-center gap-1 border-b">
        {items.map((item) => {
          const current = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
                  current
                    ? 'border-accent text-fg'
                    : 'text-fg-muted hover:text-fg border-transparent',
                  FOCUS_RING,
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
