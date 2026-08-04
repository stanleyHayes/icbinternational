import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';

import {
  TokenPurpose,
  type AccessClaims,
  type BaseClaims,
  type ChallengeClaims,
  type RefreshClaims,
  type StepUpClaims,
} from './auth.types.js';
import { durationToSeconds } from './support/duration.js';
import { randomToken } from './support/tokens.js';

/** How long a customer has to answer a second-factor challenge before starting over. */
const MFA_CHALLENGE_TTL_SECONDS = 300;

const MILLISECONDS_PER_SECOND = 1000;

/** 128 bits of `jti`. Enough to name one token uniquely in an audit trail forever. */
const JTI_BYTES = 16;

/**
 * Signs and verifies every JWT in the system.
 *
 * Two properties are worth stating explicitly.
 *
 * **Expiry is computed from `ClockService`, never from the wall clock.** The JWT library
 * would happily derive `exp` from `Date.now()`, but this bank's clock can be advanced a
 * month by the operations console; tokens minted against real time would then all appear
 * expired — or worse, survive an advance they should not have.
 *
 * **Access and refresh tokens are signed with different secrets.** Rotating the refresh
 * secret invalidates every long-lived credential in the estate without touching in-flight
 * access tokens, and a leak of one secret does not confer the powers of the other.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly stepUpTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    this.accessTtl = durationToSeconds(config.jwt.accessTtl);
    this.refreshTtl = durationToSeconds(config.jwt.refreshTtl);
    this.stepUpTtl = durationToSeconds(config.jwt.stepUpTtl);
  }

  /** Seconds an access token stays valid — also the cookie's max age. */
  get accessTtlSeconds(): number {
    return this.accessTtl;
  }

  /** Seconds a refresh token stays valid — also the session row's lifetime. */
  get refreshTtlSeconds(): number {
    return this.refreshTtl;
  }

  /** Seconds a step-up proof stays valid. */
  get stepUpTtlSeconds(): number {
    return this.stepUpTtl;
  }

  async signAccess(input: {
    userId: string;
    sessionId: string;
    deviceId: string | null;
  }): Promise<string> {
    return this.sign(
      { sub: input.userId, typ: TokenPurpose.ACCESS, sid: input.sessionId, did: input.deviceId },
      this.accessTtl,
      this.config.jwt.accessSecret,
    );
  }

  async signRefresh(input: { userId: string; sessionId: string; family: string }): Promise<string> {
    return this.sign(
      { sub: input.userId, typ: TokenPurpose.REFRESH, sid: input.sessionId, fam: input.family },
      this.refreshTtl,
      this.config.jwt.refreshSecret,
    );
  }

  async signStepUp(userId: string): Promise<string> {
    return this.sign(
      { sub: userId, typ: TokenPurpose.STEP_UP },
      this.stepUpTtl,
      this.config.jwt.accessSecret,
    );
  }

  async signChallenge(input: {
    userId: string;
    deviceId: string | null;
    remember: boolean;
  }): Promise<string> {
    return this.sign(
      {
        sub: input.userId,
        typ: TokenPurpose.MFA_CHALLENGE,
        did: input.deviceId,
        rem: input.remember,
      },
      MFA_CHALLENGE_TTL_SECONDS,
      this.config.jwt.accessSecret,
    );
  }

  /** When the challenge issued by {@link signChallenge} stops being answerable. */
  challengeExpiresAt(): Date {
    return this.clock.inSeconds(MFA_CHALLENGE_TTL_SECONDS);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    return this.verify<AccessClaims>(token, TokenPurpose.ACCESS, this.config.jwt.accessSecret);
  }

  async verifyRefresh(token: string): Promise<RefreshClaims> {
    return this.verify<RefreshClaims>(token, TokenPurpose.REFRESH, this.config.jwt.refreshSecret);
  }

  async verifyStepUp(token: string): Promise<StepUpClaims> {
    return this.verify<StepUpClaims>(token, TokenPurpose.STEP_UP, this.config.jwt.accessSecret);
  }

  async verifyChallenge(token: string): Promise<ChallengeClaims> {
    return this.verify<ChallengeClaims>(
      token,
      TokenPurpose.MFA_CHALLENGE,
      this.config.jwt.accessSecret,
    );
  }

  /** Adds the timing claims and signs. `iat`/`exp` are supplied, so the library never guesses. */
  private async sign(
    payload: Record<string, unknown>,
    ttlSeconds: number,
    secret: string,
  ): Promise<string> {
    const issuedAt = Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND);

    return this.jwt.signAsync(
      { ...payload, jti: randomToken(JTI_BYTES), iat: issuedAt, exp: issuedAt + ttlSeconds },
      { secret },
    );
  }

  /**
   * Verifies signature, expiry and purpose.
   *
   * `clockTimestamp` pins the expiry check to simulated time for the same reason signing
   * does. The purpose check is the last line: a signature proves the server issued the
   * token, not that it issued it for *this*.
   */
  private async verify<T extends BaseClaims>(
    token: string,
    expected: TokenPurpose,
    secret: string,
  ): Promise<T> {
    const claims = await this.decode<T>(token, secret);

    if (claims.typ !== expected) {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'This token cannot be used here.',
        context: { expected, actual: claims.typ },
      });
    }

    return claims;
  }

  private async decode<T extends BaseClaims>(token: string, secret: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, {
        secret,
        clockTimestamp: Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND),
      });
    } catch (error) {
      throw new AppError({
        code: isExpiry(error) ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        message: isExpiry(error) ? 'That token has expired.' : 'That token is not valid.',
        cause: error,
      });
    }
  }
}

const EXPIRED_ERROR_NAME = 'TokenExpiredError';

/** `jsonwebtoken` distinguishes expiry from every other failure only by the error name. */
function isExpiry(error: unknown): boolean {
  return error instanceof Error && error.name === EXPIRED_ERROR_NAME;
}
