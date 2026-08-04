import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/**
 * The errors this module throws, built in one place.
 *
 * As with the auth module, the copy is security copy: a wrong second factor gets the same
 * answer whether the code was mistyped, replayed, or made up, and a missing step-up proof
 * tells the customer what to do without confirming what the endpoint protects.
 */

/** Enrolment was started where an enrolment already exists. */
export function mfaAlreadyEnrolled(): AppError {
  return new AppError({
    code: ErrorCode.MFA_ALREADY_ENROLLED,
    message: 'Two-factor authentication is already set up on this account.',
  });
}

/** A factor was used or removed without an enrolment behind it. */
export function mfaNotEnrolled(): AppError {
  return new AppError({
    code: ErrorCode.MFA_NOT_ENROLLED,
    message: 'Two-factor authentication is not set up on this account.',
  });
}

/** A wrong, replayed or invented code — deliberately one answer for all three. */
export function mfaInvalidCode(): AppError {
  return new AppError({
    code: ErrorCode.MFA_INVALID_CODE,
    message: 'That code is not right. Try again.',
  });
}

/** A sensitive endpoint was called without a fresh step-up proof. */
export function stepUpRequired(): AppError {
  return new AppError({
    code: ErrorCode.STEP_UP_REQUIRED,
    message: 'Confirm it is you to continue.',
  });
}

/** A WebAuthn ceremony failed verification or was tampered with. */
export function passkeyVerificationFailed(): AppError {
  return new AppError({
    code: ErrorCode.PASSKEY_VERIFICATION_FAILED,
    message: 'We could not verify that passkey. Try again.',
  });
}
