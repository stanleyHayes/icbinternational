import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/**
 * The errors this module throws, built in one place.
 *
 * Authentication error copy is security copy: every message below is written so that it
 * tells the legitimate customer what to do next without telling an attacker anything they
 * did not already know — "credentials did not match", never "no account with that email".
 */

/** Wrong password, unknown email, wrong current password — always the same answer. */
export function invalidCredentials(): AppError {
  return new AppError({
    code: ErrorCode.INVALID_CREDENTIALS,
    message: 'That email and password combination did not match.',
  });
}

/** No usable credential was presented at all. */
export function unauthenticated(): AppError {
  return new AppError({
    code: ErrorCode.UNAUTHENTICATED,
    message: 'Sign in to continue.',
  });
}

/** The failure budget is spent. `retryAfterSeconds` drives the client's countdown. */
export function accountLocked(retryAfterSeconds: number): AppError {
  return new AppError({
    code: ErrorCode.ACCOUNT_LOCKED,
    message: 'Too many failed attempts. This account is locked for a while — try again later.',
    retryAfterSeconds,
  });
}

/** A bearer token that is not recognised, already spent, or signed out. */
export function tokenInvalid(message: string): AppError {
  return new AppError({ code: ErrorCode.TOKEN_INVALID, message });
}

/** A presented session credential is unknown to the server. */
export function sessionUnknown(): AppError {
  return tokenInvalid('That session is no longer valid. Sign in again.');
}

/** A token from a session that was explicitly ended. Not reuse — just stale. */
export function sessionSignedOut(): AppError {
  return tokenInvalid('That session has been signed out.');
}

/** A one-time email link that is spent, expired, or made up. */
export function emailLinkInvalid(): AppError {
  return tokenInvalid('That link is invalid or has already been used. Request a fresh one.');
}
