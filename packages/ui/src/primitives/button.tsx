/**
 * The Button.
 *
 * A real `<button>` with a real `type`, always. The most common accessibility defect in banking
 * UIs is a clickable `<div>` that a keyboard cannot reach and a screen reader does not announce,
 * and the second most common is a submit button that silently submits twice because nothing
 * disabled it while the first request was in flight — hence `loading` implying `disabled`.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { DISABLED, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { Spinner } from './spinner.js';

/** Visual weight. One primary action per view — the green is a promise, not decoration. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-xs',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-fg hover:bg-surface-sunken',
  danger: 'bg-danger-solid text-on-solid hover:opacity-90 active:opacity-100 shadow-xs',
};

/** Heights are fixed so a row of buttons aligns regardless of icon presence or label length. */
const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-sm',
  md: 'h-10 gap-2 rounded-md px-4 text-base',
  lg: 'h-12 gap-2 rounded-md px-6 text-lg',
};

const ICON_ONLY_CLASSES: Readonly<Record<ButtonSize, string>> = {
  sm: 'w-8 px-0',
  md: 'w-10 px-0',
  lg: 'w-12 px-0',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center font-body font-medium select-none whitespace-nowrap';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Replaces the leading icon with a spinner and blocks interaction. */
  readonly loading?: boolean;
  /** Leading icon. Decorative — the label carries the meaning. */
  readonly startIcon?: ReactNode;
  /** Trailing icon, e.g. a disclosure chevron. */
  readonly endIcon?: ReactNode;
  /** Stretches to the width of its container — mobile primary actions, dialog footers. */
  readonly fullWidth?: boolean;
  /**
   * Renders a square button with no visible label. `aria-label` becomes mandatory in practice:
   * without it the control announces as "button" and nothing more.
   */
  readonly iconOnly?: boolean;
  readonly children?: ReactNode;
}

/**
 * @example
 * <Button variant="primary" loading={isSubmitting}>Send £250.00</Button>
 * <Button variant="ghost" iconOnly aria-label="Close"><CloseIcon /></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, ...props },
  ref,
) {
  const { startIcon, endIcon, fullWidth, iconOnly, className, disabled, children, ...rest } = props;

  return (
    <button
      ref={ref}
      // An explicit type is not pedantry: the default is `submit`, so a bare toolbar button
      // inside a form posts it.
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE_CLASSES,
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        iconOnly && ICON_ONLY_CLASSES[size],
        fullWidth && 'w-full',
        FOCUS_RING,
        TRANSITION_STATE,
        DISABLED,
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : startIcon}
      {children}
      {!loading && endIcon}
    </button>
  );
});
