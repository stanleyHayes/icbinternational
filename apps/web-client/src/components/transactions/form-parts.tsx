'use client';

/**
 * The two things every small form on the money screens ends with.
 *
 * A failure has to be phrased the way a bank phrases one, and a success has to be *announced* —
 * a tick that only appears visually leaves a screen-reader user with no way to know whether their
 * change was saved. Both are easy to get subtly different in each form, so they are written once.
 *
 * They live beside the transaction components because the transaction detail was the first form
 * to need them; the account screens reuse them.
 */

import { Alert, Button } from '@reliance/ui';

import { describeError, isValidationFailure } from '@/lib/errors';

/** Props for {@link FailureAlert}. */
export interface FailureAlertProps {
  readonly error: unknown;
  /** Suppresses the banner when the failure is already shown against a field. */
  readonly handledInline?: boolean;
}

/**
 * A failure, in the bank's voice — or nothing, when there is no failure to report.
 *
 * Field-level validation is deliberately swallowed when the form is showing it inline: telling
 * somebody twice that a name is too long does not make it shorter.
 */
export function FailureAlert({ error, handledInline }: FailureAlertProps) {
  if (!error) return null;
  if (handledInline && isValidationFailure(error)) return null;

  const described = describeError(error);
  return (
    <Alert tone="danger" title={described.title}>
      {described.message}
    </Alert>
  );
}

/** Props for {@link SaveRow}. */
export interface SaveRowProps {
  readonly label: string;
  readonly pending: boolean;
  readonly disabled: boolean;
  /** True once the change has been accepted and there is nothing left to save. */
  readonly saved: boolean;
}

/**
 * @example <SaveRow label="Save name" pending={update.isPending} disabled={unchanged} saved={done} />
 */
export function SaveRow({ label, pending, disabled, saved }: SaveRowProps) {
  return (
    <div aria-live="polite" className="flex items-center gap-3">
      <Button type="submit" loading={pending} disabled={disabled}>
        {label}
      </Button>
      {saved ? <span className="text-credit text-sm">Saved</span> : null}
    </div>
  );
}
