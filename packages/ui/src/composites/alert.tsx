'use client';

/**
 * The Alert — an inline banner attached to the thing it is about.
 *
 * Distinct from Toast, which is transient and global. An alert stays: "This account is frozen"
 * must not disappear after four seconds. Destructive and warning tones get `role="alert"` so they
 * interrupt; informational ones get `role="status"` so they wait their turn.
 */

import { type HTMLAttributes, type ReactNode } from 'react';

import { AlertTriangleIcon, CloseIcon, InfoIcon } from '../foundation/icons.js';
import { FOCUS_RING_INSET } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { BANNER_TONE, type Tone } from './tone.js';

/** Tones that describe a problem, and therefore interrupt. */
const INTERRUPTING: ReadonlySet<Tone> = new Set<Tone>(['danger', 'warning', 'debit']);

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly tone?: Tone;
  readonly title?: ReactNode;
  /** Leading icon. Defaults to a warning triangle for problems, an "i" otherwise. */
  readonly icon?: ReactNode;
  /** Renders a dismiss button. Omit for conditions the user cannot dismiss, like a frozen card. */
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
}

const DEFAULT_DISMISS_LABEL = 'Dismiss';

/**
 * @example
 * <Alert tone="warning" title="Card frozen">Unfreeze it to spend again.</Alert>
 */
export function Alert(props: Readonly<AlertProps>) {
  const {
    tone = 'info',
    title,
    icon,
    onDismiss,
    dismissLabel,
    className,
    children,
    ...rest
  } = props;
  const interrupting = INTERRUPTING.has(tone);

  return (
    <div
      role={interrupting ? 'alert' : 'status'}
      className={cn(
        // A hairline in the tone colour rather than a thick left bar: the tint already carries
        // the severity, and the bar only adds weight to a component that interrupts often.
        'font-body flex items-start gap-3 rounded-md border p-4 text-sm',
        BANNER_TONE[tone],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon ?? (interrupting ? <AlertTriangleIcon /> : <InfoIcon />)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-display font-semibold">{title}</p>}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? DEFAULT_DISMISS_LABEL}
          className={cn('text-fg-muted hover:text-fg shrink-0 rounded-sm p-1', FOCUS_RING_INSET)}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
