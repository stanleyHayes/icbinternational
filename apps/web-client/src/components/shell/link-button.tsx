'use client';

/**
 * A link that looks like a button.
 *
 * The design system's `Button` renders a real `<button>`, which is correct — a control that
 * *does* something must be a button, and putting an anchor inside one produces markup no screen
 * reader can describe. Where the control *goes* somewhere, the element has to be an anchor, so it
 * gets the button's clothes and none of its semantics.
 */

import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn, DISABLED, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

/** Visual weight, mirroring the design system's button variants. */
export type LinkButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Readonly<Record<LinkButtonVariant, string>> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-xs',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-fg hover:bg-surface-sunken',
};

const SIZE = 'h-10 gap-2 rounded-md px-4 text-base';

/** Props for {@link LinkButton}. */
export interface LinkButtonProps {
  readonly href: Route;
  readonly variant?: LinkButtonVariant;
  readonly fullWidth?: boolean;
  readonly startIcon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** Set when the link replaces the current entry rather than adding one — a wizard step, say. */
  readonly replace?: boolean;
}

/**
 * @example
 * <LinkButton href={appRoutes.dashboard} variant="secondary">Go to your accounts</LinkButton>
 */
export function LinkButton({
  href,
  variant = 'primary',
  fullWidth,
  startIcon,
  children,
  className,
  replace,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      replace={replace}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none',
        SIZE,
        VARIANT[variant],
        FOCUS_RING,
        TRANSITION_STATE,
        DISABLED,
        fullWidth && 'w-full',
        className,
      )}
    >
      {startIcon}
      {children}
    </Link>
  );
}
