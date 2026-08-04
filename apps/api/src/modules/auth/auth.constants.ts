/**
 * Module-wide constants.
 *
 * Kept in one place so the security-relevant numbers — how long a reset link lives, how a
 * revocation is labelled — are reviewable at a glance rather than scattered through
 * services as literals.
 */

/** The single-use links the API sends by email. The raw token is emailed; only its hash is stored. */
export const AuthTokenKind = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  // A flow label, not a credential — the scanner matches on the word alone.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;
export type AuthTokenKind = (typeof AuthTokenKind)[keyof typeof AuthTokenKind];

/**
 * Why a session row was revoked. Stored on the row itself, so a support agent asked
 * "why was I signed out?" can answer from the data rather than from guesswork.
 */
export const SessionRevocation = {
  LOGGED_OUT: 'LOGGED_OUT',
  REUSE_DETECTED: 'REUSE_DETECTED',
  // A revocation reason label, not a credential.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  REMOTE_REVOKE: 'REMOTE_REVOKE',
} as const;
export type SessionRevocation = (typeof SessionRevocation)[keyof typeof SessionRevocation];

/** A verification link stays usable for a day; people do not all read email immediately. */
export const EMAIL_VERIFICATION_TTL_SECONDS = 86_400;

/** A reset link is a credential substitute — an hour, no more. */
export const PASSWORD_RESET_TTL_SECONDS = 3_600;

/** The `outcome` a successful login reports, from the contract's discriminated union. */
export const LOGIN_OUTCOME_AUTHENTICATED = 'AUTHENTICATED' as const;

/** The `outcome` a login reports when a second factor is owed before a session is issued. */
export const LOGIN_OUTCOME_MFA_REQUIRED = 'MFA_REQUIRED' as const;

/** Recorded when a request arrives without the network metadata a session normally carries. */
export const UNKNOWN_ORIGIN = 'unknown';
