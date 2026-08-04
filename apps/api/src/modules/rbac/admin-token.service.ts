import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';
import { durationToSeconds } from '../auth/support/duration.js';

import { type AdminAccessClaims } from './admin-auth.types.js';
import { ADMIN_TOKEN_PURPOSE } from './rbac.constants.js';

const MILLISECONDS_PER_SECOND = 1000;

/** 128 bits of `jti`, so one token can be named uniquely in an audit trail. */
const JTI_BYTES = 16;

const EXPIRED_ERROR_NAME = 'TokenExpiredError';

/**
 * Signs and verifies admin access tokens.
 *
 * Two deliberate choices mirror the customer `TokenService`, for the same reasons.
 * Timing claims are computed from `ClockService`, never the wall clock: the bank's clock
 * can be advanced by the operations console, and tokens must age with it. And the token
 * carries a purpose claim distinct from every customer token's, checked on every verify —
 * that purpose check *is* the admin scope separation. A customer access token is a valid
 * signature over the wrong scope, and this service rejects it.
 *
 * Issuance (`signAccess`) is called by the admin login flow once SSO-style credentials
 * and TOTP have both been verified — that flow belongs to A-05/the admin shell work, so
 * `mfaVerified` is a parameter the caller asserts, not something this service checks.
 */
@Injectable()
export class AdminTokenService {
  private readonly accessTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    this.accessTtl = durationToSeconds(config.jwt.accessTtl);
  }

  /** Seconds an admin access token stays valid. */
  get accessTtlSeconds(): number {
    return this.accessTtl;
  }

  /**
   * Issues an admin access token.
   *
   * `mfaVerified` must be the outcome of a real TOTP check by the caller. It lands on
   * the token as the `mfa` claim, and the auth guard refuses any token where it is not
   * true — mandatory second factor is enforced at every request, not trusted from login.
   */
  async signAccess(input: { adminId: string; mfaVerified: boolean }): Promise<string> {
    const issuedAt = Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND);

    return this.jwt.signAsync(
      {
        sub: input.adminId,
        typ: ADMIN_TOKEN_PURPOSE,
        mfa: input.mfaVerified,
        jti: randomBytes(JTI_BYTES).toString('hex'),
        iat: issuedAt,
        exp: issuedAt + this.accessTtl,
      },
      { secret: this.config.jwt.accessSecret },
    );
  }

  /**
   * Verifies signature, expiry and scope.
   *
   * @throws {AppError} `TOKEN_EXPIRED` past `exp`; `TOKEN_INVALID` for a bad signature,
   *   a wrong purpose, or a payload that is not an admin access token.
   */
  async verifyAccess(token: string): Promise<AdminAccessClaims> {
    const claims = await this.decode(token);

    if (claims.typ !== ADMIN_TOKEN_PURPOSE || typeof claims.mfa !== 'boolean') {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'That token is not valid.',
        context: { expected: ADMIN_TOKEN_PURPOSE, actual: claims.typ },
      });
    }

    return claims;
  }

  private async decode(token: string): Promise<AdminAccessClaims> {
    try {
      return await this.jwt.verifyAsync<AdminAccessClaims>(token, {
        secret: this.config.jwt.accessSecret,
        clockTimestamp: Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND),
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === EXPIRED_ERROR_NAME;
      throw new AppError({
        code: expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        message: expired ? 'That token has expired.' : 'That token is not valid.',
        cause: error,
      });
    }
  }
}
