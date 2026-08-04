'use client';

/**
 * Why the customer is looking at the sign-in screen.
 *
 * Being returned to sign-in with no explanation is the moment people assume they have been hacked.
 * Each of these says plainly what happened and, where it matters, that it was not a problem.
 */

import { Alert } from '@reliance/ui';

import { SignInReason } from '@/lib/routes';

interface Explanation {
  readonly tone: 'info' | 'success';
  readonly title: string;
  readonly body: string;
}

const EXPLANATIONS: Readonly<Record<SignInReason, Explanation>> = {
  [SignInReason.EXPIRED]: {
    tone: 'info',
    title: 'Your session has ended',
    body: 'We sign you out after a period of inactivity to keep your account safe. Sign in again and we will take you back to where you were.',
  },
  [SignInReason.SIGNED_OUT]: {
    tone: 'success',
    title: 'You are signed out',
    body: 'This device no longer has access to your accounts.',
  },
  [SignInReason.CREDENTIALS_UPDATED]: {
    tone: 'success',
    title: 'Your password is changed',
    body: 'We have signed you out everywhere else. Sign in with your new password.',
  },
};

function isReason(value: string | null): value is SignInReason {
  return value !== null && value in EXPLANATIONS;
}

/** Renders the explanation for a known reason, and nothing for anything else. */
export function SignInReasonNotice({ reason }: { readonly reason: string | null }) {
  if (!isReason(reason)) return null;
  const explanation = EXPLANATIONS[reason];

  return (
    <div role="status">
      <Alert tone={explanation.tone} title={explanation.title}>
        {explanation.body}
      </Alert>
    </div>
  );
}
