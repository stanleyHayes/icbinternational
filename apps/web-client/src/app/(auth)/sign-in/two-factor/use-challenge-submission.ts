'use client';

/**
 * Answering the challenge.
 *
 * The chosen method and the device-trust answer start as `null` rather than as copies of the
 * challenge's own values, so "what the customer picked" and "what the sign-in form suggested" stay
 * distinguishable and neither has to be synchronised into state.
 */

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MfaMethod } from '@reliance/contracts';
import { OTP_LENGTH } from '@reliance/ui';

import { completeChallenge } from '@/lib/auth-client';
import { forgetChallenge, type StoredChallenge } from '@/lib/challenge-store';

/** The customer's answers, before they are sent. */
export interface ChallengeChoices {
  readonly method: MfaMethod;
  readonly setMethod: (method: MfaMethod) => void;
  readonly code: string;
  readonly setCode: (code: string) => void;
  readonly trustDevice: boolean;
  readonly setTrustDevice: (trusted: boolean) => void;
}

/** What {@link useChallengeSubmission} hands back. */
export interface ChallengeSubmission extends ChallengeChoices {
  readonly failure: unknown;
  readonly submitting: boolean;
  readonly submit: (code: string) => void;
}

function useChoices(challenge: StoredChallenge | null): ChallengeChoices {
  const [method, setMethod] = useState<MfaMethod | null>(null);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState<boolean | null>(null);

  return {
    method: method ?? challenge?.methods[0] ?? MfaMethod.TOTP,
    setMethod,
    code,
    setCode,
    trustDevice: trustDevice ?? challenge?.rememberDevice ?? false,
    setTrustDevice,
  };
}

/**
 * @param challenge the pending challenge, or `null` when there is none.
 * @param destination where to go once the session exists.
 * @param blocked true once the challenge has expired.
 */
export function useChallengeSubmission(
  challenge: StoredChallenge | null,
  destination: Route,
  blocked: boolean,
): ChallengeSubmission {
  const router = useRouter();
  const choices = useChoices(challenge);
  const [failure, setFailure] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const arrive = (): void => {
    forgetChallenge();
    router.replace(destination);
    router.refresh();
  };

  const submit = (value: string): void => {
    if (!challenge || blocked || value.length < OTP_LENGTH) return;
    setSubmitting(true);
    setFailure(null);

    void completeChallenge({
      challengeId: challenge.challengeId,
      method: choices.method,
      code: value,
      rememberDevice: choices.trustDevice,
    })
      .then(arrive)
      .catch((error: unknown) => {
        setFailure(error);
        choices.setCode('');
      })
      .finally(() => setSubmitting(false));
  };

  return { ...choices, failure, submitting, submit };
}
