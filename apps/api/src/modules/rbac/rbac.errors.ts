import { ErrorCode, type Permission } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/**
 * The guard chain's vocabulary of refusals.
 *
 * Every rejection is an `AppError` with a contract code so the envelope and the HTTP
 * status come from the same place they do everywhere else. None of these messages name
 * roles or permission internals beyond what the caller already presented.
 */

/** No token, a token for the wrong scope, or an admin row that is not there. */
export function adminUnauthenticated(): AppError {
  return new AppError({
    code: ErrorCode.UNAUTHENTICATED,
    message: 'This endpoint requires an authenticated administrator',
  });
}

/** The admin row exists but is deactivated. */
export function adminInactive(): AppError {
  return AppError.forbidden('This staff account is deactivated');
}

/** TOTP was not verified at login. Mandatory for every staff session. */
export function adminMfaRequired(): AppError {
  return new AppError({
    code: ErrorCode.MFA_REQUIRED,
    message: 'This endpoint requires a verified second factor',
  });
}

/** The admin is authenticated but the endpoint wants a permission they do not hold. */
export function permissionDenied(required: Permission): AppError {
  return new AppError({
    code: ErrorCode.PERMISSION_DENIED,
    message: `This endpoint requires the ${required} permission`,
    context: { required },
  });
}

/** The admin's stored allowlist is non-empty and the client IP is not on it. */
export function ipNotAllowed(): AppError {
  return new AppError({
    code: ErrorCode.IP_NOT_ALLOWED,
    message: 'This network location is not permitted for this staff account',
  });
}
