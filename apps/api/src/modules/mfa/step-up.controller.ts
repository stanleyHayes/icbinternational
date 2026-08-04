import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { routes, stepUpRequestSchema, type StepUpRequest } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { StepUpService, type StepUpGrant } from './step-up.service.js';

/**
 * Issues step-up grants: a short-lived proof of re-authentication for sensitive calls.
 *
 * The grant travels in the response body, not a cookie — it belongs in the
 * `x-step-up-token` header of the one call it authorises, and a cookie would silently
 * attach it to every request until it expired.
 */
@Controller()
export class StepUpController {
  constructor(private readonly stepUp: StepUpService) {}

  /** Verifies the presented factor and mints a five-minute grant. */
  @Post(routes.auth.stepUp)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(stepUpRequestSchema)) input: StepUpRequest,
  ): Promise<StepUpGrant> {
    return this.stepUp.grant(user.userId, input);
  }
}
