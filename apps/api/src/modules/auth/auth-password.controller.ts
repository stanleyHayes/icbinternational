import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { type z } from 'zod';

import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  routes,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { type AuthenticatedUser } from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { EmailTokenService } from './email-token.service.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordResetService } from './password-reset.service.js';

type EmailRequest = z.infer<typeof forgotPasswordRequestSchema>;
type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/**
 * The email-bound and password-management endpoints.
 *
 * Everything here answers with `204`-style emptiness (`{ data: null }`): these flows
 * confirm nothing about whether an address is registered, and there is no user state to
 * return that the client does not already have.
 */
@Controller()
export class AuthPasswordController {
  constructor(
    private readonly emailTokens: EmailTokenService,
    private readonly resets: PasswordResetService,
  ) {}

  /** Re-sends the confirmation link. Silent unless the address is genuinely waiting. */
  @Post(routes.auth.resendVerification)
  async resendVerification(
    @Body(zodBody(forgotPasswordRequestSchema)) input: EmailRequest,
  ): Promise<null> {
    await this.emailTokens.requestVerification(input.email);
    return null;
  }

  /** Starts the reset flow. Identical answer whether or not the address exists. */
  @Post(routes.auth.forgotPassword)
  async forgotPassword(
    @Body(zodBody(forgotPasswordRequestSchema)) input: EmailRequest,
  ): Promise<null> {
    await this.emailTokens.requestPasswordReset(input.email);
    return null;
  }

  /** Sets a new password from the emailed link and signs out every session. */
  @Post(routes.auth.resetPassword)
  async resetPassword(
    @Body(zodBody(resetPasswordRequestSchema)) input: ResetPasswordRequest,
  ): Promise<null> {
    await this.resets.reset(input.token, input.password);
    return null;
  }

  /** Changes the password from an authenticated session; every other session dies. */
  @Post(routes.auth.changePassword)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(changePasswordRequestSchema)) input: ChangePasswordRequest,
  ): Promise<null> {
    await this.resets.change(user, input.currentPassword, input.newPassword);
    return null;
  }
}
