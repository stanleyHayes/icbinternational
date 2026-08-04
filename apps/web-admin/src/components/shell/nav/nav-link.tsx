/**
 * One row in the sidebar.
 *
 * The active row is marked with `aria-current="page"` and styled from that attribute, so
 * the visual state and the announced state cannot drift apart — a screen-reader user and
 * a sighted user are told the same thing by the same source.
 */

'use client';

import Link from 'next/link';

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { href } from '@/lib/routes';

import type { NavItem } from './nav-model';

const ROW_BASE =
  'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-body text-sm ' +
  'text-fg-muted hover:bg-surface-sunken hover:text-fg';

const ROW_ACTIVE =
  'aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium ' +
  'aria-[current=page]:text-accent';

export interface NavLinkProps {
  readonly item: NavItem;
  readonly active: boolean;
  /** Called after navigation, so a mobile drawer can close itself. */
  readonly onNavigate?: () => void;
}

/** A sidebar destination. */
export function NavLink({ item, active, onNavigate }: NavLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={href(item.path)}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(ROW_BASE, ROW_ACTIVE, FOCUS_RING, TRANSITION_STATE)}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
