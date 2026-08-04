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

/**
 * A rejected sign-in: unknown address, wrong password, or wrong authenticator code.
 *
 * Deliberately one answer for all three. Both factors are submitted together, so a
 * refusal that distinguished them would tell an attacker that the password was right and
 * hand back most of the value of having a second factor. It is also why the login path
 * hashes against a decoy for an address that does not exist — same answer, same cost.
 */
export function adminCredentialsRejected(): AppError {
  return new AppError({
    code: ErrorCode.INVALID_CREDENTIALS,
    message: 'Those sign-in details were not accepted.',
  });
}

/**
 * The password was right but the account has been deactivated.
 *
 * Distinct from {@link adminInactive}, which is the guard refusing an already-issued
 * token: this reaches the sign-in screen, which ends the attempt on it rather than
 * inviting a retry that cannot succeed. Reported only after a correct password, so it
 * never tells a stranger which addresses are staff.
 */
export function adminDeactivated(): AppError {
  return new AppError({
    code: ErrorCode.ACCOUNT_SUSPENDED,
    message: 'This staff account is deactivated. Contact the security team.',
  });
}

/** Staff sign-in always needs an enrolled authenticator; there is no password-only path. */
export function adminMfaNotEnrolled(): AppError {
  return new AppError({
    code: ErrorCode.MFA_NOT_ENROLLED,
    message: 'This staff account has no authenticator enrolled. Contact the security team.',
  });
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
