import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  cn,
  DISABLED,
  FOCUS_RING,
  TRANSITION_STATE,
  type ButtonSize,
  type ButtonVariant,
} from '@reliance/ui';

import type { SiteHref } from '@/lib/routes';

/**
 * A link that looks like the design system's Button.
 *
 * Not a reimplementation of `Button` — it is the same visual language applied to an
 * `<a>`. A call to action that navigates must be a link: it has to survive middle-click,
 * "open in new tab", a crawler and a screen reader's link list, and none of that works
 * when a `<button>` is wrapped in an anchor (which is also invalid HTML).
 */

const VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-xs',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-fg hover:bg-surface-sunken',
  danger: 'bg-danger-solid text-on-solid hover:opacity-90',
};

const SIZE: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-sm',
  md: 'h-10 gap-2 rounded-md px-4 text-base',
  lg: 'h-12 gap-2 rounded-md px-6 text-lg',
};

const BASE =
  'inline-flex items-center justify-center font-body font-medium whitespace-nowrap select-none';

export interface LinkButtonProps {
  readonly href: SiteHref;
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly startIcon?: ReactNode;
  readonly endIcon?: ReactNode;
  readonly className?: string;
}

/**
 * @example <LinkButton href="/open-an-account" size="lg">Open an account</LinkButton>
 */
export function LinkButton(props: LinkButtonProps) {
  const { href, children, variant = 'primary', size = 'md', fullWidth, startIcon, endIcon } = props;

  return (
    <Link
      href={href}
      className={cn(
        BASE,
        SIZE[size],
        VARIANT[variant],
        fullWidth === true && 'w-full',
        FOCUS_RING,
        TRANSITION_STATE,
        DISABLED,
        props.className,
      )}
    >
      {startIcon}
      {children}
      {endIcon}
    </Link>
  );
}

/** The same treatment for a link that leaves the marketing site — the customer app, say. */
export function ExternalLinkButton(
  props: Omit<LinkButtonProps, 'href'> & { readonly href: string },
) {
  const { href, children, variant = 'secondary', size = 'md', startIcon, endIcon } = props;

  return (
    <a
      href={href}
      className={cn(
        BASE,
        SIZE[size],
        VARIANT[variant],
        FOCUS_RING,
        TRANSITION_STATE,
        props.className,
      )}
    >
      {startIcon}
      {children}
      {endIcon}
    </a>
  );
}
