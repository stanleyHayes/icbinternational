/**
 * Staff sign-in.
 *
 * Two visible steps, one request. The password and the authenticator code are collected
 * separately because that is how staff expect to be asked, but they are submitted
 * together, so the platform's answer never reveals *which* factor was wrong. Telling an
 * attacker that the password was right and only the code was missing is most of the value
 * of having a second factor.
 *
 * Some refusals end the attempt rather than returning the operator to the form. A locked
 * account, an unenrolled authenticator or a network outside the allowlist are not
 * mistakes that retrying corrects, and a form that invites a retry teaches people to
 * hammer it.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';

import { useApiClient } from '@/lib/api-client';
import { useReplace } from '@/lib/routes';
import { SESSION_QUERY_KEY } from '@/lib/session';

/** Which half of the sign-in the operator is on. */
export type SignInStage = 'credentials' | 'verification';

/** Refusals that end the attempt instead of returning to the form. */
const TERMINAL_CODES: readonly ErrorCode[] = [
  ErrorCode.IP_NOT_ALLOWED,
  ErrorCode.ACCOUNT_LOCKED,
  ErrorCode.ACCOUNT_SUSPENDED,
  ErrorCode.MFA_NOT_ENROLLED,
  ErrorCode.PERMISSION_DENIED,
];

/** Digits in an authenticator code. */
export const TOTP_LENGTH = 6;

interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** What the sign-in screen needs in order to render itself. */
export interface SignInController {
  readonly stage: SignInStage;
  readonly email: string;
  readonly setEmail: (email: string) => void;
  readonly password: string;
  readonly setPassword: (password: string) => void;
  readonly code: string;
  readonly setCode: (code: string) => void;
  /** Moves to the authenticator step. Sends nothing. */
  readonly continueToVerification: () => void;
  /** Returns to the first step, clearing the code. */
  readonly backToCredentials: () => void;
  readonly submit: () => void;
  readonly isSubmitting: boolean;
  /** The last refusal, if any. */
  readonly error: ApiClientError | null;
  /** True when the refusal ends the attempt and the form should not be offered again. */
  readonly isTerminal: boolean;
}

function isTerminalRefusal(error: ApiClientError | null): boolean {
  return error !== null && error.isAnyOf(...TERMINAL_CODES);
}

/** Drives the sign-in screen. */
export function useSignIn(returnTo: string): SignInController {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const replace = useReplace();

  const [stage, setStage] = useState<SignInStage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: (credentials: Credentials) =>
      client.admin.login({ ...credentials, totpCode: code }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      replace(returnTo);
    },
    onError: () => setCode(''),
  });

  const error = ApiClientError.isApiClientError(mutation.error) ? mutation.error : null;

  return {
    stage,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    continueToVerification: () => setStage('verification'),
    backToCredentials: () => {
      setCode('');
      mutation.reset();
      setStage('credentials');
    },
    submit: () => mutation.mutate({ email, password }),
    isSubmitting: mutation.isPending,
    error,
    isTerminal: isTerminalRefusal(error),
  };
}
