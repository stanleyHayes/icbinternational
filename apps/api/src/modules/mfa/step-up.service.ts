import { Injectable } from '@nestjs/common';

import { ErrorCode, MfaMethod, type StepUpRequest } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { TokenService } from '../auth/token.service.js';

import { FactorVerificationService } from './factor-verification.service.js';

/**
 * A fresh step-up grant. Matches the shape the client dashboard already consumes
 * (`stepUpGrantSchema` in the api-client's provisional module): the token goes in the
 * `x-step-up-token` header of the one sensitive call it authorises, and the UI counts
 * down to `expiresAt` rather than letting the call fail.
 */
export interface StepUpGrant {
  token: string;
  expiresAt: string;
  issuedAt: string;
}

/**
 * Re-authentication for sensitive actions.
 *
 * A step-up is a second proof of presence, not a second login: any enrolled factor —
 * authenticator code, recovery code, or passkey — discharges it, and the grant is a JWT
 * whose TTL (five minutes by default) is the whole window. Nothing is stored server-side;
 * the grant is single-purpose by its `typ` claim, so it cannot be replayed as any other
 * token, and it dies on its own without a revocation list.
 */
@Injectable()
export class StepUpService {
  constructor(
    private readonly factors: FactorVerificationService,
    private readonly tokens: TokenService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Verifies the presented factor and mints the grant.
   *
   * @throws {AppError} `MFA_INVALID_CODE` for a wrong factor; `MFA_NOT_ENROLLED` when the
   *   chosen method was never set up; `VALIDATION_FAILED` for a method step-up does not
   *   support (SMS is not a presence proof this bank accepts).
   */
  async grant(userId: string, input: StepUpRequest): Promise<StepUpGrant> {
    await this.verifyFactor(userId, input);

    return {
      token: await this.tokens.signStepUp(userId),
      expiresAt: this.clock.inSeconds(this.tokens.stepUpTtlSeconds).toISOString(),
      issuedAt: this.clock.now().toISOString(),
    };
  }

  private async verifyFactor(userId: string, input: StepUpRequest): Promise<void> {
    switch (input.method) {
      case MfaMethod.TOTP:
        return this.factors.verifyTotp(userId, input.credential);
      case MfaMethod.RECOVERY_CODE:
        return this.factors.consumeRecoveryCode(userId, input.credential);
      case MfaMethod.PASSKEY:
        return this.factors.verifyPasskey(userId, input.credential);
      default:
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'That method cannot be used to confirm it is you.',
        });
    }
  }
}
