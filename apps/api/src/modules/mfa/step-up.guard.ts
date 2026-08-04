import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { STEP_UP_HEADER } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { unauthenticated } from '../auth/auth.errors.js';
import { type AuthenticatedRequest } from '../auth/auth.types.js';
import { headerValue } from '../auth/support/requests.js';
import { TokenService } from '../auth/token.service.js';

import { stepUpRequired } from './mfa.errors.js';
import { STEP_UP_METADATA_KEY } from './step-up.decorator.js';

/**
 * Enforces `@StepUp()`: a fresh re-authentication proof on sensitive endpoints.
 *
 * The proof is a short-lived JWT minted by `POST /auth/step-up` and carried in the
 * `x-step-up-token` header. Its TTL *is* the re-auth window — five minutes unless
 * reconfigured — and `TokenService.verifyStepUp` enforces it against the simulated clock,
 * so an advanced business date cannot stretch the window.
 *
 * Every failure mode — missing, expired, forged, or minted for a different user — gets
 * the same `STEP_UP_REQUIRED` answer: the client's remedy is identical (re-authenticate),
 * and distinguishing them would only help someone probing a stolen token.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  /**
   * @throws {AppError} `UNAUTHENTICATED` when no session guard ran first (a wiring
   *   defect, not a customer error); `STEP_UP_REQUIRED` for anything wrong with the proof.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(STEP_UP_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw unauthenticated();

    const token = headerValue(request, STEP_UP_HEADER);
    if (!token) throw stepUpRequired();

    await this.assertFreshProof(token, request.user.userId);
    return true;
  }

  private async assertFreshProof(token: string, userId: string): Promise<void> {
    try {
      const claims = await this.tokens.verifyStepUp(token);
      if (claims.sub !== userId) throw stepUpRequired();
    } catch (error) {
      if (error instanceof AppError) throw stepUpRequired();
      throw error;
    }
  }
}
