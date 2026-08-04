import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';

import {
  mfaVerifyRequestSchema,
  routes,
  type LoginResult,
  type MfaVerifyRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { LOGIN_OUTCOME_AUTHENTICATED } from '../auth/auth.constants.js';
import { originOf } from '../auth/support/requests.js';
import { DeviceService } from '../devices/device.service.js';

import { MfaChallengeService } from './mfa-challenge.service.js';

/**
 * Completes an MFA-gated login. Public like the login endpoint itself: the credential
 * here is the challenge token, which only exists because a password already verified.
 *
 * Remembering a device happens only after the factor passes — trusting the machine first
 * would let a failed attempt still soften the next one.
 */
@Controller()
export class MfaChallengeController {
  constructor(
    private readonly challenges: MfaChallengeService,
    private readonly devices: DeviceService,
    private readonly cookies: AuthCookiesService,
  ) {}

  /** Verifies the second factor and sets the session cookies. */
  @Post(routes.auth.mfaVerify)
  async verify(
    @Body(zodBody(mfaVerifyRequestSchema)) input: MfaVerifyRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const completed = await this.challenges.complete(input, originOf(request));

    if (input.rememberDevice && completed.deviceId) {
      await this.devices.trust(completed.userId, completed.deviceId);
    }

    this.cookies.establish(response, completed.auth);
    return { outcome: LOGIN_OUTCOME_AUTHENTICATED, user: completed.auth.user };
  }
}
