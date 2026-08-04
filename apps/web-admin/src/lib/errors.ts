/**
 * Turning a refused request into something an operator can act on.
 *
 * An operations console is worse than a customer app for leaking machine language,
 * because staff tolerate it — they learn the codes and stop reading. Then a genuinely
 * unusual failure looks like all the others. Every refusal here says what happened and
 * what the operator can do next, and the trace id is offered separately for the one
 * case where it matters.
 */

import { ApiClientError } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';

/** Shown when nothing more specific is known. */
const FALLBACK_MESSAGE = 'We could not complete that request. Try again in a moment.';

/** Shown when the request never reached the platform. */
const OFFLINE_MESSAGE =
  'We could not reach the banking platform. Check your connection and try again.';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_FAILED]: 'Some details need correcting before this can be submitted.',
  [ErrorCode.NOT_FOUND]: 'That record no longer exists, or was never visible to your role.',
  [ErrorCode.CONFLICT]: 'Someone else changed this record while you had it open. Reload and retry.',
  [ErrorCode.PRECONDITION_FAILED]: 'This record is not in a state that allows that action.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests in a short window. Wait a moment and try again.',
  [ErrorCode.INTERNAL_ERROR]:
    'The banking platform could not complete that request. Nothing was changed.',
  [ErrorCode.SERVICE_UNAVAILABLE]:
    'The banking platform is not accepting requests right now. Nothing was changed.',
  [ErrorCode.DEPENDENCY_FAILED]:
    'A system this action depends on did not respond. Nothing was changed.',
  [ErrorCode.UNAUTHENTICATED]: 'Your session has ended. Sign in again to continue.',
  [ErrorCode.INVALID_CREDENTIALS]: 'That email address and password do not match our records.',
  [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Sign in again to continue.',
  [ErrorCode.ACCOUNT_LOCKED]:
    'This staff account is locked. Contact the security desk to have it released.',
  [ErrorCode.ACCOUNT_SUSPENDED]:
    'This staff account has been suspended. Contact the security desk.',
  [ErrorCode.MFA_REQUIRED]: 'Enter the code from your authenticator app to continue.',
  [ErrorCode.MFA_INVALID_CODE]:
    'That code was not accepted. Codes change every 30 seconds — wait for the next one.',
  [ErrorCode.MFA_NOT_ENROLLED]:
    'This staff account has no authenticator enrolled. Contact the security desk to enrol one.',
  [ErrorCode.STEP_UP_REQUIRED]: 'Confirm your identity again before completing this action.',
  [ErrorCode.FORBIDDEN]: 'Your role does not allow that action.',
  [ErrorCode.PERMISSION_DENIED]:
    'Your role does not allow that action. Ask a supervisor to raise the request instead.',
  [ErrorCode.IP_NOT_ALLOWED]:
    'This network is not on the allowlist for your staff account. Sign in from an office network or a managed device.',
  [ErrorCode.DUAL_APPROVAL_REQUIRED]:
    'This action needs a second approver before it can take effect.',
  [ErrorCode.SELF_APPROVAL_FORBIDDEN]:
    'You raised this request, so you cannot approve it. A different colleague must decide it.',
  [ErrorCode.INSUFFICIENT_FUNDS]:
    'The available balance on that account is too low for this posting.',
  [ErrorCode.CURRENCY_MISMATCH]: 'Both sides of a posting must be in the same currency.',
  [ErrorCode.UNBALANCED_JOURNAL_ENTRY]:
    'The debits and credits on this entry do not sum to zero, so it cannot be posted.',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]:
    'This request was already submitted. Reload the record to see the outcome.',
  [ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT]:
    'This request is still being processed. Give it a moment before retrying.',
};

/** Copy for a failed request, in the bank's voice. Safe to call with any thrown value. */
export function messageFor(error: unknown): string {
  if (!ApiClientError.isApiClientError(error)) return FALLBACK_MESSAGE;
  if (error.isTransportFailure) return OFFLINE_MESSAGE;
  return MESSAGES[error.code] ?? FALLBACK_MESSAGE;
}

/**
 * The trace id, when the platform issued one.
 *
 * Offered next to an error so an operator raising an incident can quote it, rather than
 * being made to read it as part of the message.
 */
export function traceIdFor(error: unknown): string | null {
  if (!ApiClientError.isApiClientError(error)) return null;
  return error.traceId === '' ? null : error.traceId;
}

/** True when the refusal was about authorisation rather than the request's content. */
export function isAuthorisationFailure(error: unknown): boolean {
  if (!ApiClientError.isApiClientError(error)) return false;
  return error.isAnyOf(ErrorCode.FORBIDDEN, ErrorCode.PERMISSION_DENIED, ErrorCode.IP_NOT_ALLOWED);
}

/** True when the operator has no usable session and must sign in again. */
export function isSessionFailure(error: unknown): boolean {
  if (!ApiClientError.isApiClientError(error)) return false;
  return error.isAnyOf(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.TOKEN_EXPIRED,
    ErrorCode.TOKEN_INVALID,
    ErrorCode.TOKEN_REUSE_DETECTED,
  );
}

/** Field-level failures, for a form to attach to its inputs. */
export function fieldErrorsFor(error: unknown): Readonly<Record<string, string>> {
  if (!ApiClientError.isApiClientError(error)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) result[detail.path] = detail.message;
  return result;
}
