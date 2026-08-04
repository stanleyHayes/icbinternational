import { type Request } from 'express';

/**
 * Shapes shared by the token service, the guards and the controllers.
 *
 * Every token this module issues carries a `typ` claim naming its purpose. Without it, a
 * token minted for one job could be presented for another — a five-minute step-up proof
 * replayed as a thirty-day refresh token, say — because both are simply valid signatures
 * over a user id. The purpose is checked on every verification, not just decoded.
 */

/** What a token is allowed to be used for. */
export const TokenPurpose = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  STEP_UP: 'step-up',
  MFA_CHALLENGE: 'mfa-challenge',
} as const;
export type TokenPurpose = (typeof TokenPurpose)[keyof typeof TokenPurpose];

/** Claims present on every token. */
export interface BaseClaims {
  /** Public user id, `usr_…`. */
  sub: string;
  typ: TokenPurpose;
  /** Unique per token, so a specific token can be named in an audit trail. */
  jti: string;
  iat: number;
  exp: number;
}

/** Short-lived proof of an authenticated session, carried in the `rb.at` cookie. */
export interface AccessClaims extends BaseClaims {
  typ: typeof TokenPurpose.ACCESS;
  /** Session this token belongs to; revoking the session invalidates it at the next refresh. */
  sid: string;
  did: string | null;
}

/** The rotating half of the pair, carried in the `rb.rt` cookie. */
export interface RefreshClaims extends BaseClaims {
  typ: typeof TokenPurpose.REFRESH;
  sid: string;
  /** Login family, revoked wholesale when reuse is detected. */
  fam: string;
}

/** Proof of a recent re-authentication, required by sensitive endpoints. */
export interface StepUpClaims extends BaseClaims {
  typ: typeof TokenPurpose.STEP_UP;
}

/** Issued when a login is correct but still owes a second factor. */
export interface ChallengeClaims extends BaseClaims {
  typ: typeof TokenPurpose.MFA_CHALLENGE;
  did: string | null;
  /** Whether the customer asked to skip the challenge on this device next time. */
  rem: boolean;
}

/** What a guard attaches to the request once a token has been accepted. */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  deviceId: string | null;
}

/** An Express request that has passed `JwtAuthGuard`. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Where a request came from. Recorded on every session so a customer can recognise it. */
export interface RequestOrigin {
  ip: string;
  userAgent: string;
}
