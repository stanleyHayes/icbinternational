'use client';

/**
 * One destination in the navigation.
 *
 * `aria-current="page"` carries the "you are here" state, not the background tint — colour alone
 * is not a signal, and a customer using high-contrast mode or a screen reader gets nothing from a
 * tint. The tint is the sighted shorthand for the same fact.
 */

import Link from 'next/link';

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import type { NavItem } from '@/lib/nav';

/** Props for {@link NavLink}. */
export interface NavLinkProps {
  readonly item: NavItem;
  readonly current: boolean;
  /** Called after navigation, so a drawer can close itself. */
  readonly onNavigate?: () => void;
}

/** A sidebar row: icon, label, and the current-page marker. */
export function NavLink({ item, current, onNavigate }: NavLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
        FOCUS_RING,
        TRANSITION_STATE,
        current ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-pill bg-accent absolute left-0 h-5 w-0.5',
          current ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', current && 'text-accent')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Props for {@link MobileNavLink}. */
export interface MobileNavLinkProps {
  readonly item: NavItem;
  readonly current: boolean;
}

/** A bottom-bar destination: a tall tap target with the label always visible. */
export function MobileNavLink({ item, current }: MobileNavLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs',
        FOCUS_RING,
        TRANSITION_STATE,
        current ? 'text-accent font-semibold' : 'text-fg-muted',
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
