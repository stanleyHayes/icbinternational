'use client';

/**
 * Signing in, and deciding what a failure means.
 *
 * Three refusals are not form errors and are routed to a screen of their own: a second factor, an
 * unverified email address and a locked account. Everything else is shown inline, in the API's own
 * words, with no distinction between "no such email" and "wrong password" — telling them apart is
 * an account-enumeration oracle.
 */

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';

import { signIn, type Credentials } from '@/lib/auth-client';
import { rememberChallenge } from '@/lib/challenge-store';
import { authRoutes, withReturn } from '@/lib/routes';

/** What {@link useSignIn} hands back. */
export interface SignInState {
  /** The last failure worth showing inline, or `null`. */
  readonly failure: unknown;
  readonly setFailure: (failure: unknown) => void;
  /** Sends the credentials and routes onwards. */
  readonly attempt: (credentials: Credentials) => Promise<void>;
  /** Called when another path — a passkey — has established the session. */
  readonly arrive: () => void;
}

function screenFor(error: unknown): Route | null {
  if (!ApiClientError.isApiClientError(error)) return null;
  if (error.is(ErrorCode.ACCOUNT_LOCKED)) return authRoutes.accountLocked;
  if (error.is(ErrorCode.EMAIL_NOT_VERIFIED)) return authRoutes.verifyEmail;
  return null;
}

/** @param destination where to go once the session exists. */
export function useSignIn(destination: Route): SignInState {
  const router = useRouter();
  const [failure, setFailure] = useState<unknown>(null);

  const arrive = (): void => {
    router.replace(destination);
    router.refresh();
  };

  const attempt = async (credentials: Credentials): Promise<void> => {
    setFailure(null);
    try {
      const outcome = await signIn(credentials);
      if (outcome.kind === 'signed-in') {
        arrive();
        return;
      }
      rememberChallenge({
        ...outcome.challenge,
        email: credentials.email,
        rememberDevice: credentials.rememberDevice,
      });
      router.push(withReturn(authRoutes.twoFactor, destination));
    } catch (error) {
      const screen = screenFor(error);
      if (screen) router.push(screen);
      else setFailure(error);
    }
  };

  return { failure, setFailure, attempt, arrive };
}
