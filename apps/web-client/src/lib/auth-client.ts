/**
 * Sign-in, sign-out and the second factor, from the browser.
 *
 * Every path here ends the same way: the bank establishes its httpOnly cookies, and then this app
 * records that sign-in completed by asking its own `/api/session` route to set the marker cookie a
 * server render reads. Doing it in that order matters — the marker is written only after the bank
 * has agreed, so it can never claim a session the bank would refuse.
 */

import { type LoginResult, type MfaMethod, type User } from '@reliance/contracts';

import { browserApi } from './api';
import { deviceFingerprint } from './device';
import { assertPasskey, PasskeyError } from './passkey';

/** The challenge branch of a sign-in, as the second-factor screen needs it. */
export interface MfaChallenge {
  readonly challengeId: string;
  readonly methods: readonly MfaMethod[];
  readonly expiresAt: string;
}

/** What a sign-in attempt produced. */
export type SignInOutcome =
  | { readonly kind: 'signed-in'; readonly user: User }
  | { readonly kind: 'challenge'; readonly challenge: MfaChallenge };

/** Credentials as the sign-in form collects them. */
export interface Credentials {
  readonly email: string;
  readonly password: string;
  readonly rememberDevice: boolean;
}

const SESSION_ENDPOINT = '/api/session';
const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/**
 * Records that sign-in completed.
 *
 * The body is only consulted where the bank cannot be reached from the server; otherwise the route
 * handler re-asks the bank who this is and ignores what the browser claimed.
 */
async function establishSession(userId: string): Promise<void> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error('The session could not be established.');
}

function toOutcome(result: LoginResult): SignInOutcome {
  if (result.outcome === 'AUTHENTICATED') return { kind: 'signed-in', user: result.user };
  return {
    kind: 'challenge',
    challenge: {
      challengeId: result.challengeId,
      methods: result.methods,
      expiresAt: result.expiresAt,
    },
  };
}

/** Signs in with an email address and password. */
export async function signIn(credentials: Credentials): Promise<SignInOutcome> {
  const { data } = await browserApi().auth.login({
    email: credentials.email,
    password: credentials.password,
    deviceFingerprint: deviceFingerprint(),
    rememberDevice: credentials.rememberDevice,
  });

  const outcome = toOutcome(data);
  if (outcome.kind === 'signed-in') await establishSession(outcome.user.id);
  return outcome;
}

/** Answer to a second-factor challenge. */
export interface ChallengeAnswer {
  readonly challengeId: string;
  readonly method: MfaMethod;
  readonly code: string;
  readonly rememberDevice: boolean;
}

/** Completes a second-factor challenge and establishes the session. */
export async function completeChallenge(answer: ChallengeAnswer): Promise<User> {
  const { data } = await browserApi().auth.verifyMfa({
    challengeId: answer.challengeId,
    method: answer.method,
    code: answer.code,
    rememberDevice: answer.rememberDevice,
  });
  await establishSession(data.id);
  return data;
}

/**
 * Signs in with a passkey.
 *
 * @throws {PasskeyError} when the browser cannot run the ceremony or the customer dismissed it.
 */
export async function signInWithPasskey(): Promise<User> {
  const api = browserApi();
  const { data: ceremony } = await api.mfa.passkeyAuthOptions();
  const credential = await assertPasskey(ceremony.publicKey);

  const { data: verification } = await api.mfa.passkeyAuthVerify({
    challengeId: ceremony.challengeId,
    credential,
  });
  if (!verification.verified) throw new PasskeyError('That passkey was not accepted.');

  const { data: user } = await api.auth.me();
  await establishSession(user.id);
  return user;
}

/**
 * Ends the session everywhere it is recorded.
 *
 * The marker is cleared even when the bank call fails: leaving it behind would show a signed-out
 * customer a dashboard shell that then 401s on every panel, which reads as a broken bank rather
 * than a completed sign-out.
 */
export async function signOut(): Promise<void> {
  try {
    await browserApi().auth.logout();
  } finally {
    await fetch(SESSION_ENDPOINT, { method: 'DELETE' });
  }
}
