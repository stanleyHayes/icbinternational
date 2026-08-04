import { Injectable } from '@nestjs/common';

import { ErrorCode, MfaMethod, type MfaVerifyRequest } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { type RequestOrigin } from '../auth/auth.types.js';
import { type AuthSuccess } from '../auth/login.service.js';
import { SessionService } from '../auth/session.service.js';
import { TokenService } from '../auth/token.service.js';
import { toUserView, UsersService } from '../auth/users/index.js';

import { FactorVerificationService } from './factor-verification.service.js';

/** The freshly established session plus the context the controller needs to finish up. */
export interface CompletedChallenge {
  auth: AuthSuccess;
  userId: string;
  /** The device the challenge was minted for; trusted when the customer asked. */
  deviceId: string | null;
}

/**
 * The second half of an MFA-gated login.
 *
 * The challenge token is the only state: it names the user whose password already
 * verified, the device they are on, and whether they asked to skip future challenges on
 * it. Verification re-checks the account status — a suspension issued during the
 * five-minute window must win — then spends the presented factor and only then starts
 * the session. Order is load-bearing: a session minted before the factor check would
 * survive its own rejection.
 */
@Injectable()
export class MfaChallengeService {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly factors: FactorVerificationService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Verifies the challenge and the factor, then mints the session token pair.
   *
   * @throws {AppError} `TOKEN_EXPIRED` / `TOKEN_INVALID` for a stale or forged challenge;
   *   the factor errors (`MFA_INVALID_CODE`, `MFA_NOT_ENROLLED`) otherwise.
   */
  async complete(input: MfaVerifyRequest, origin: RequestOrigin): Promise<CompletedChallenge> {
    const claims = await this.tokens.verifyChallenge(input.challengeId);
    const user = await this.users.requireCredentialsById(claims.sub);
    this.users.assertCanAuthenticate(user);

    await this.verifyFactor(claims.sub, input);

    const bundle = await this.sessions.create(user.id, claims.did, origin);
    return {
      auth: {
        user: toUserView(user),
        accessToken: bundle.accessToken,
        refreshToken: bundle.refreshToken,
      },
      userId: user.id,
      deviceId: claims.did,
    };
  }

  private async verifyFactor(userId: string, input: MfaVerifyRequest): Promise<void> {
    switch (input.method) {
      case MfaMethod.TOTP:
        return this.factors.verifyTotp(userId, input.code);
      case MfaMethod.RECOVERY_CODE:
        return this.factors.consumeRecoveryCode(userId, input.code);
      default:
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'That method is verified another way. Use your passkey to finish signing in.',
        });
    }
  }
}
