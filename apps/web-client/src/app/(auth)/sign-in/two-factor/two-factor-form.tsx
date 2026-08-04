'use client';

/**
 * The second-factor challenge.
 *
 * The challenge expires, and the countdown says so before it does rather than letting the customer
 * type six digits into a dead form. When it runs out the screen offers the only thing that can
 * help — start again — instead of a code box that will always be refused.
 *
 * Arriving here with no pending challenge (a bookmark, a reload in a new tab) is not an error
 * state: it means sign in first, so that is what it says.
 *
 * The challenge comes from a subscribable store rather than from state seeded in an effect, so the
 * server render and the browser agree without a second pass.
 */

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { FormAlert, LinkButton } from '@/components/shell';
import { challengeStore, forgetChallenge } from '@/lib/challenge-store';
import { maskEmail } from '@/lib/format';
import { authRoutes } from '@/lib/routes';

import { AuthCard } from '../../_components/auth-card';

import { ChallengeFields } from './challenge-fields';
import { useChallengeCountdown } from './use-challenge-countdown';
import { useChallengeSubmission } from './use-challenge-submission';

function NoChallenge() {
  return (
    <AuthCard
      title="Start again"
      description="This confirmation step has nothing to confirm — it may have been left open too long."
    >
      <LinkButton href={authRoutes.signIn} fullWidth>
        Back to sign in
      </LinkButton>
    </AuthCard>
  );
}

/** Props for {@link TwoFactorForm}. */
export interface TwoFactorFormProps {
  readonly destination: Route;
}

/** Collects the one-time code and finishes the sign-in. */
/**
 * The pending challenge, its countdown, and the way out of it.
 *
 * The challenge lives in an external store rather than in React state because it survives
 * the navigation from the sign-in page; `useSyncExternalStore` is what keeps the component
 * consistent with it during concurrent rendering.
 */
function useTwoFactor(destination: string) {
  const router = useRouter();
  const challenge = useSyncExternalStore(
    challengeStore.subscribe,
    challengeStore.read,
    challengeStore.readServer,
  );

  const countdown = useChallengeCountdown(
    challenge
      ? { expiresAt: challenge.expiresAt, receivedAtMs: challenge.receivedAtMs }
      : undefined,
  );
  const answer = useChallengeSubmission(challenge, destination, countdown.expired);

  function abandon(): void {
    forgetChallenge();
    router.replace(authRoutes.signIn);
  }

  return { challenge, countdown, answer, abandon };
}

export function TwoFactorForm({ destination }: TwoFactorFormProps) {
  const { challenge, countdown, answer, abandon } = useTwoFactor(destination);
  const { remaining, expired, known } = countdown;

  if (!challenge) return <NoChallenge />;

  return (
    <AuthCard
      title="Confirm it's you"
      description={`We need a second check before we open the account for ${maskEmail(challenge.email)}.`}
      footer={
        <button type="button" onClick={abandon} className="text-accent font-medium hover:underline">
          Use a different account
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={answer.failure} />
        <ChallengeFields
          methods={challenge.methods}
          answer={answer}
          remaining={remaining}
          expired={expired}
          known={known}
        />
      </div>
    </AuthCard>
  );
}
