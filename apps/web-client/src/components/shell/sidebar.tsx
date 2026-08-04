'use client';

/**
 * The primary navigation column.
 *
 * A single `<nav>` with one list, in one order, on every screen. Below `lg` it is not rendered at
 * all — the bottom bar and the top bar's menu carry navigation there — rather than being hidden
 * with CSS, so a screen-reader user on a phone is not read a second copy of the whole app.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn, TEXT_STYLE } from '@reliance/ui';

import { isCurrent, PRIMARY_NAV } from '@/lib/nav';
import { appRoutes } from '@/lib/routes';

import { BrandLockup } from './brand-mark';
import { NavLink } from './nav-link';
import { SidebarFooter } from './sidebar-footer';

/** Props for {@link SidebarNav}. */
export interface SidebarNavProps {
  /** Called after a destination is chosen, so a drawer can close. */
  readonly onNavigate?: () => void;
  readonly className?: string;
}

/** The list of destinations, without the surrounding column. Reused inside the mobile drawer. */
export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={cn('flex flex-col gap-0.5', className)}>
      {PRIMARY_NAV.map((item) => (
        <NavLink
          key={item.key}
          item={item}
          current={isCurrent(pathname, item.href)}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ))}
    </nav>
  );
}

/** The full column: brand, navigation, and the account controls at the foot. */
export function Sidebar() {
  return (
    <div className="border-border bg-surface flex h-full flex-col gap-6 border-r px-4 py-5">
      <Link
        href={appRoutes.dashboard}
        className="focus-visible:ring-focus rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none"
      >
        <BrandLockup className="text-fg h-9 w-auto" title="Reliance Bank — go to your accounts" />
      </Link>

      <div className="rb-scroll -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <SidebarNav />
      </div>

      <p className={cn(TEXT_STYLE.caption, 'px-3 text-xs')}>
        Reliance Bank plc. Eligible deposits are protected up to £85,000.
      </p>

      <SidebarFooter />
    </div>
  );
}
