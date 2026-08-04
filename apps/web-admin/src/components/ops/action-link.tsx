/**
 * A link that looks like a control.
 *
 * Navigation must be an anchor: an operator middle-clicking a queue to open it in a
 * second tab is normal behaviour in a back office, and a `<button>` that calls the
 * router silently refuses to do it. Wrapping an anchor in a button, which is the usual
 * shortcut for getting the styling, produces markup no assistive technology can make
 * sense of — so the styling lives here instead.
 */

'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { href } from '@/lib/routes';

const BASE =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 font-body text-sm ' +
  'font-medium whitespace-nowrap transition-colors';

const VARIANT = {
  ghost: 'text-fg hover:bg-surface-sunken',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-sunken',
} as const;

export interface ActionLinkProps {
  /** Absolute path inside the console, e.g. `/aml/alerts`. */
  readonly to: string;
  readonly variant?: keyof typeof VARIANT;
  readonly children: ReactNode;
}

/** A navigation control styled to sit beside the design system's buttons. */
export function ActionLink({ to, variant = 'ghost', children }: ActionLinkProps) {
  return (
    <Link href={href(to)} className={cn(BASE, VARIANT[variant], FOCUS_RING)}>
      {children}
    </Link>
  );
}
