'use client';

/**
 * The controls of the challenge screen: method, code, device trust, countdown and submit.
 *
 * The countdown lives in a polite live region so a screen-reader user is told the request is about
 * to expire rather than discovering it when the code is refused.
 */

import type { MfaMethod } from '@reliance/contracts';
import { Button, OTP_LENGTH, OTPInput } from '@reliance/ui';

import { formatCountdown } from '@/lib/clock';

import { DeviceTrustPrompt } from '../../_components/device-trust-prompt';

import { MethodPicker } from './method-picker';
import type { ChallengeSubmission } from './use-challenge-submission';

/** Props for {@link ChallengeFields}. */
export interface ChallengeFieldsProps {
  readonly methods: readonly MfaMethod[];
  readonly answer: ChallengeSubmission;
  readonly remaining: number;
  readonly expired: boolean;
  /** False before the browser's clock is known; the countdown is not shown until it is. */
  readonly known: boolean;
}

function expiryLine(expired: boolean, known: boolean, remaining: number): string {
  if (expired) return 'This code request has expired. Sign in again to get a new one.';
  if (!known) return 'This request expires shortly.';
  return `This request expires in ${formatCountdown(remaining)}.`;
}

/** Everything below the heading on the challenge screen. */
export function ChallengeFields({
  methods,
  answer,
  remaining,
  expired,
  known,
}: ChallengeFieldsProps) {
  return (
    <>
      <MethodPicker methods={methods} value={answer.method} onChange={answer.setMethod} />

      <OTPInput
        label="Six-digit code"
        value={answer.code}
        onValueChange={answer.setCode}
        onComplete={answer.submit}
        disabled={answer.submitting || expired}
      />

      <DeviceTrustPrompt checked={answer.trustDevice} onChange={answer.setTrustDevice} />

      <p aria-live="polite" className="text-fg-muted text-sm">
        {expiryLine(expired, known, remaining)}
      </p>

      <Button
        fullWidth
        loading={answer.submitting}
        disabled={answer.code.length < OTP_LENGTH || expired}
        onClick={() => answer.submit(answer.code)}
      >
        Confirm and sign in
      </Button>
    </>
  );
}
