/**
 * Turning an API failure into something a customer can act on.
 *
 * A contract error code is precise and useless to the person holding the phone. Every code the
 * dashboard can provoke is given a sentence that says what happened and what to do next, in the
 * register a bank writes in. Nothing here ever renders the code itself — the trace id is the
 * reference a customer quotes to support, and it is the only opaque string we show.
 */

import { ApiClientError } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';

/** A failure, phrased for the person who caused it. */
export interface CustomerFacingError {
  /** Short heading. Sentence case, no full stop. */
  readonly title: string;
  /** One or two sentences: what happened, then what to do. */
  readonly message: string;
  /** Server-side reference. Shown only when there is one, and only in small print. */
  readonly reference: string | null;
  /** True when trying again unchanged is a reasonable thing to offer. */
  readonly retryable: boolean;
}

const SIGN_IN_AGAIN = 'Sign in again to continue.';
const TRY_AGAIN_SHORTLY = 'Please try again in a few moments.';
const CONTACT_US = 'Contact us if you think this is wrong.';

const CHECK_DETAILS: CustomerFacingError = {
  title: 'Check the details',
  message:
    'Some of what you entered does not look right. Correct the highlighted fields and try again.',
  reference: null,
  retryable: false,
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  // --- Credentials and session -------------------------------------------
  [ErrorCode.INVALID_CREDENTIALS]:
    'Those details do not match our records. Check your email address and password, then try again.',
  [ErrorCode.UNAUTHENTICATED]: `Your session has ended for your security. ${SIGN_IN_AGAIN}`,
  [ErrorCode.TOKEN_EXPIRED]: `Your session has ended for your security. ${SIGN_IN_AGAIN}`,
  [ErrorCode.TOKEN_INVALID]: `We could not confirm your session. ${SIGN_IN_AGAIN}`,
  [ErrorCode.TOKEN_REUSE_DETECTED]:
    'We ended your session because it was used from somewhere unexpected. Sign in again, and change your password if you did not do this.',
  [ErrorCode.ACCOUNT_LOCKED]:
    'We have locked this account after several unsuccessful sign-in attempts. Reset your password to unlock it, or call us on 0800 460 0460.',
  [ErrorCode.ACCOUNT_SUSPENDED]:
    'This account is suspended. Call us on 0800 460 0460 and we will explain what happens next.',
  [ErrorCode.EMAIL_NOT_VERIFIED]:
    'Confirm your email address before you sign in. We have sent you a new link.',
  [ErrorCode.EMAIL_ALREADY_REGISTERED]:
    'There is already an account with this email address. Sign in instead, or reset your password.',
  [ErrorCode.PHONE_ALREADY_REGISTERED]:
    'This mobile number is already on another account. Use a different number, or call us on 0800 460 0460.',
  [ErrorCode.PASSWORD_TOO_WEAK]:
    'Choose a longer password. It needs at least 12 characters, including an uppercase letter, a lowercase letter and a number.',
  [ErrorCode.PASSWORD_REUSED]: 'Choose a password you have not used on this account before.',

  // --- Second factor and step-up -----------------------------------------
  [ErrorCode.MFA_REQUIRED]: 'Confirm it is you to carry on.',
  [ErrorCode.MFA_INVALID_CODE]:
    'That code is not right. Codes last 30 seconds — wait for the next one and enter it again.',
  [ErrorCode.MFA_NOT_ENROLLED]:
    'You have not set up a second step yet. Add one in Settings before you use this.',
  [ErrorCode.MFA_ALREADY_ENROLLED]: 'This second step is already set up on your account.',
  [ErrorCode.STEP_UP_REQUIRED]: 'Confirm it is you before we make this change.',
  [ErrorCode.PASSKEY_VERIFICATION_FAILED]:
    'We could not use that passkey. Try again, or sign in with your password instead.',
  [ErrorCode.DEVICE_NOT_TRUSTED]:
    'We do not recognise this device. Confirm it is you, and we will remember it next time.',

  // --- Onboarding ---------------------------------------------------------
  [ErrorCode.KYC_REQUIRED]: 'Finish setting up your account before you use this.',
  [ErrorCode.KYC_PENDING_REVIEW]:
    'We are still reviewing your details. This usually takes a few minutes, and we will let you know as soon as it is done.',
  [ErrorCode.KYC_REJECTED]: `We were not able to open an account this time. ${CONTACT_US}`,
  [ErrorCode.KYC_TIER_TOO_LOW]:
    'You need to verify a little more about yourself before you can do this. It takes about two minutes.',
  [ErrorCode.KYC_DOCUMENT_INVALID]:
    'We could not read that document. Make sure all four corners are visible, the photo is in focus and there is no glare.',

  // --- Money --------------------------------------------------------------
  [ErrorCode.INSUFFICIENT_FUNDS]:
    'There is not enough available balance to cover this. Money on hold does not count towards what you can spend.',
  [ErrorCode.LIMIT_EXCEEDED]:
    'This is over your limit for today. You can ask us to raise it in Settings.',

  // --- Platform -----------------------------------------------------------
  [ErrorCode.RATE_LIMITED]: `You have tried that too many times. ${TRY_AGAIN_SHORTLY}`,
  [ErrorCode.NOT_FOUND]:
    'We could not find what you were looking for. It may have been moved or removed.',
  [ErrorCode.CONFLICT]: 'Something changed while you were working. Reload the page and try again.',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'That file is too large. Upload one under 10 MB.',
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 'We accept JPEG, PNG and PDF files.',
  [ErrorCode.FEATURE_DISABLED]: 'This is not available on your account yet.',
  [ErrorCode.MAINTENANCE_MODE]:
    'We are carrying out planned maintenance. Everything will be back shortly — your money is unaffected.',
  [ErrorCode.SERVICE_UNAVAILABLE]: `We could not reach that service. ${TRY_AGAIN_SHORTLY}`,
  [ErrorCode.DEPENDENCY_FAILED]: `We could not complete that. ${TRY_AGAIN_SHORTLY}`,
  [ErrorCode.FORBIDDEN]: `You do not have access to this. ${CONTACT_US}`,
  [ErrorCode.PERMISSION_DENIED]: `You do not have access to this. ${CONTACT_US}`,
};

/** Titles for the few failures whose heading should not be the generic one. */
const TITLES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.INVALID_CREDENTIALS]: 'We could not sign you in',
  [ErrorCode.ACCOUNT_LOCKED]: 'This account is locked',
  [ErrorCode.ACCOUNT_SUSPENDED]: 'This account is suspended',
  [ErrorCode.MFA_INVALID_CODE]: 'That code did not work',
  [ErrorCode.STEP_UP_REQUIRED]: 'One more check',
  [ErrorCode.RATE_LIMITED]: 'Too many attempts',
  [ErrorCode.MAINTENANCE_MODE]: 'Back very soon',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'We could not reach the bank',
  [ErrorCode.INSUFFICIENT_FUNDS]: 'Not enough available balance',
  [ErrorCode.KYC_PENDING_REVIEW]: 'We are reviewing your details',
};

/** Codes where offering "try again" is honest rather than an invitation to hammer the API. */
const RETRYABLE: ReadonlySet<string> = new Set<string>([
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.DEPENDENCY_FAILED,
  ErrorCode.INTERNAL_ERROR,
  ErrorCode.CONFLICT,
]);

const FALLBACK: CustomerFacingError = {
  title: 'Something went wrong',
  message: `We could not complete that just now. ${TRY_AGAIN_SHORTLY} If it keeps happening, call us on 0800 460 0460.`,
  reference: null,
  retryable: true,
};

/** True when the failure is a field-level validation problem the form should surface inline. */
export function isValidationFailure(error: unknown): boolean {
  return ApiClientError.isApiClientError(error) && error.is(ErrorCode.VALIDATION_FAILED);
}

/** Field-level messages keyed by form field name, for a `VALIDATION_FAILED` response. */
export function fieldErrors(error: unknown): Readonly<Record<string, string>> {
  if (!ApiClientError.isApiClientError(error)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) result[detail.path] = detail.message;
  return result;
}

/**
 * The sentence to show a customer for any thrown value.
 *
 * Deliberately total: an unknown throw still produces bank-grade copy, because the alternative is
 * a stack trace or an empty alert on a screen where somebody is trying to move money.
 */
export function describeError(error: unknown): CustomerFacingError {
  if (!ApiClientError.isApiClientError(error)) return FALLBACK;

  if (error.isTransportFailure) {
    return {
      title: 'No connection',
      message:
        'We could not reach the bank. Check your connection and try again — nothing has been sent.',
      reference: null,
      retryable: true,
    };
  }

  if (error.is(ErrorCode.VALIDATION_FAILED)) {
    return { ...CHECK_DETAILS, reference: error.traceId || null };
  }

  return {
    title: TITLES[error.code] ?? FALLBACK.title,
    message: MESSAGES[error.code] ?? FALLBACK.message,
    reference: error.traceId || null,
    retryable: RETRYABLE.has(error.code),
  };
}

/** True when the failure means the session is over and the customer must sign in again. */
export function isSessionEnded(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) &&
    error.isAnyOf(
      ErrorCode.UNAUTHENTICATED,
      ErrorCode.TOKEN_EXPIRED,
      ErrorCode.TOKEN_INVALID,
      ErrorCode.TOKEN_REUSE_DETECTED,
    )
  );
}
