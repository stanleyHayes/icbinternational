'use client';

/**
 * The Toast — a transient, global confirmation.
 *
 * Toasts are for things that succeeded: "Payee added", "Card frozen". They are the wrong place
 * for anything the user must act on, because they vanish, and a dismissed error is an error the
 * user never saw. Failures that need a decision belong in an Alert next to the thing that failed.
 */

import { type ReactNode } from 'react';

import { CloseIcon } from '../foundation/icons.js';
import { FOCUS_RING_INSET } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { DOT_TONE, type Tone } from './tone.js';

/** A queued notification. */
export interface ToastItem {
  readonly id: string;
  readonly tone?: Tone;
  readonly title: string;
  readonly description?: ReactNode;
  /** A single undo or "view" control. Anything more belongs on the page. */
  readonly action?: ReactNode;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  readonly duration?: number;
}

const DISMISS_LABEL = 'Dismiss notification';

export interface ToastProps {
  readonly toast: ToastItem;
  readonly onDismiss: (id: string) => void;
}

/**
 * One toast. Rendered by ToastProvider — you will normally call `useToast().notify()` instead.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const { id, tone = 'neutral', title, description, action } = toast;

  return (
    <div
      // `status` rather than `alert`: a success confirmation should not interrupt whatever the
      // screen reader is currently saying. The provider's region owns the live behaviour.
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border',
        'border-border bg-surface-raised font-body text-fg animate-slide-up p-4 text-sm shadow-lg',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('rounded-pill mt-1.5 size-2 shrink-0', DOT_TONE[tone])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-fg-muted">{description}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label={DISMISS_LABEL}
        className={cn('text-fg-muted hover:text-fg shrink-0 rounded-sm p-1', FOCUS_RING_INSET)}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
