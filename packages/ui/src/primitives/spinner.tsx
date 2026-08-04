/**
 * The indeterminate progress indicator.
 *
 * Used inside Button while a request is in flight and anywhere a wait is short enough that a
 * Skeleton would flash. Longer waits should show a Skeleton of the eventual content instead —
 * a spinner tells the user nothing about what is coming.
 */

import { cn } from '../lib/cn.js';

export interface SpinnerProps {
  /** Size utility, e.g. `size-4`. Defaults to matching the surrounding text. */
  readonly className?: string;
  /**
   * Accessible label. Omit when the spinner sits inside a control that already announces the
   * busy state (Button sets `aria-busy`), otherwise a screen reader hears the wait twice.
   */
  readonly label?: string;
}

/** A rotating arc that inherits `currentColor`. */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('size-4 shrink-0 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
