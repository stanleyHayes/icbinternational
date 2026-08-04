'use client';

/**
 * How an authentication screen reports a failure.
 *
 * `role="alert"` so it is announced the moment it appears — a customer using a screen reader who
 * presses Sign in and hears nothing has no way to know the attempt was refused.
 *
 * The message always comes from `describeError`, which means no contract code ever reaches the
 * screen. The trace id does, in small print, because it is the one string support will ask for.
 */

import { Alert } from '@reliance/ui';

import { describeError, type CustomerFacingError } from '@/lib/errors';

/** Props for {@link FormAlert}. */
export interface FormAlertProps {
  /** The thrown value. `null` renders nothing. */
  readonly error: unknown;
  /** Overrides the derived heading where the screen has better context. */
  readonly title?: string;
}

/** Renders a failure in the bank's voice, or nothing. */
export function FormAlert({ error, title }: FormAlertProps) {
  if (error === null || error === undefined) return null;
  const described: CustomerFacingError = describeError(error);

  return (
    <Alert tone="danger" title={title ?? described.title}>
      <span>{described.message}</span>
      {described.reference ? (
        <span className="text-fg-subtle mt-2 block font-mono text-xs select-all">
          Reference {described.reference}
        </span>
      ) : null}
    </Alert>
  );
}

/** Props for {@link FormNotice}. */
export interface FormNoticeProps {
  readonly title: string;
  readonly children: React.ReactNode;
  /** Announce it. Use for anything that appeared in response to something the customer did. */
  readonly live?: boolean;
}

/** A neutral, non-failure message — "we've sent you a link", "this device is new to us". */
export function FormNotice({ title, children, live }: FormNoticeProps) {
  return (
    <div {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}>
      <Alert tone="info" title={title}>
        {children}
      </Alert>
    </div>
  );
}
