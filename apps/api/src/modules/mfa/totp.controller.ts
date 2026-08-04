import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { type z } from 'zod';

import { routes, totpConfirmRequestSchema } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { MfaService, type RecoveryCodeIssue, type TotpEnrolmentOffer } from './mfa.service.js';
import { StepUp } from './step-up.decorator.js';

type TotpConfirmRequest = z.infer<typeof totpConfirmRequestSchema>;

/**
 * TOTP enrolment and recovery codes.
 *
 * The two destructive routes are step-up gated: disabling a factor and re-issuing the
 * codes that bypass it are exactly the actions an attacker with a stolen session would
 * take first, so both demand a fresh proof of presence.
 */
@Controller()
export class TotpController {
  constructor(private readonly mfa: MfaService) {}

  /** Starts enrolment: a pending secret, its URI, and a server-rendered QR code. */
  @Post(routes.mfa.totpEnrol)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  enrol(@CurrentUser() user: AuthenticatedUser): Promise<TotpEnrolmentOffer> {
    return this.mfa.beginEnrolment(user.userId);
  }

  /** Confirms enrolment with a code from the authenticator app. */
  @Post(routes.mfa.totpConfirm)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(totpConfirmRequestSchema)) input: TotpConfirmRequest,
  ): Promise<null> {
    await this.mfa.confirmEnrolment(user.userId, input.code);
    return null;
  }

  /** Removes TOTP and the recovery codes that exist to rescue it. Step-up gated. */
  @Delete(routes.mfa.totpDisable)
  @StepUp()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async disable(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    await this.mfa.disable(user.userId);
    return null;
  }

  /** Mints a new set of recovery codes, killing the old set. Step-up gated. */
  @Post(routes.mfa.recoveryCodes)
  @StepUp()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  recoveryCodes(@CurrentUser() user: AuthenticatedUser): Promise<RecoveryCodeIssue> {
    return this.mfa.regenerateRecoveryCodes(user.userId);
  }
}
