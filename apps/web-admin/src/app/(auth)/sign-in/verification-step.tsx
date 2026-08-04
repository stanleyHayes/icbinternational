/**
 * Step two: the authenticator code.
 *
 * There is no "remember this device" and no way past this step. Staff access to customer
 * money is the one place in the bank where a second factor is not a setting, so the
 * screen does not pretend it is optional by offering an alternative.
 */

'use client';

import type { FormEvent } from 'react';

import { Alert, Button, OTPInput } from '@reliance/ui';

import { messageFor } from '@/lib/errors';

import { TOTP_LENGTH } from './use-sign-in';

const CODE_LABEL = 'Six-digit code from your authenticator app';

export interface VerificationStepProps {
  readonly email: string;
  readonly code: string;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly isSubmitting: boolean;
  /** A refusal the operator can correct by trying again. */
  readonly error: unknown;
}

/** The authenticator half of staff sign-in. */
export function VerificationStep(props: VerificationStepProps) {
  const complete = props.code.length === TOTP_LENGTH;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (complete && !props.isSubmitting) props.onSubmit();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-semibold">Confirm it is you</h1>
        <p className="font-body text-fg-muted text-sm">
          Enter the current code for <span className="text-fg font-medium">{props.email}</span>.
        </p>
      </div>

      {props.error !== null && props.error !== undefined && (
        <Alert tone="danger">{messageFor(props.error)}</Alert>
      )}

      {/* Focus must move to the code boxes as the step changes: this screen replaces the
          password form in place, and leaving focus on a control that no longer exists
          strands a keyboard or screen-reader user at the top of the document. */}
      {/* eslint-disable jsx-a11y/no-autofocus */}
      <OTPInput
        label={CODE_LABEL}
        length={TOTP_LENGTH}
        value={props.code}
        onValueChange={props.onCodeChange}
        onComplete={props.onSubmit}
        disabled={props.isSubmitting}
        autoFocus
      />
      {/* eslint-enable jsx-a11y/no-autofocus */}

      <Button type="submit" fullWidth loading={props.isSubmitting} disabled={!complete}>
        Sign in
      </Button>

      <Button type="button" variant="ghost" fullWidth onClick={props.onBack}>
        Use a different account
      </Button>
    </form>
  );
}
