import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type z } from 'zod';

import {
  loginRequestSchema,
  registerRequestSchema,
  routes,
  verifyEmailRequestSchema,
  type LoginRequest,
  type LoginResult,
  type RegisterRequest,
  type User as UserView,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { AuthCookiesService } from './auth-cookies.service.js';
import { LOGIN_OUTCOME_AUTHENTICATED, LOGIN_OUTCOME_MFA_REQUIRED } from './auth.constants.js';
import { type AuthenticatedUser } from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LoginService } from './login.service.js';
import { RegistrationService } from './registration.service.js';
import { originOf, refreshCookieOf } from './support/requests.js';

type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/**
 * The session endpoints.
 *
 * Tokens never appear in a response body — a successful login or refresh sets them as
 * httpOnly cookies and answers with the *user*. What the client can read, it may keep in
 * application state; what it cannot read, XSS cannot steal.
 */
@Controller()
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly sessions: LoginService,
    private readonly cookies: AuthCookiesService,
  ) {}

  /** Opens an identity and emails the confirmation link. No session yet — verify first. */
  @Post(routes.auth.register)
  register(@Body(zodBody(registerRequestSchema)) input: RegisterRequest): Promise<UserView> {
    return this.registration.register(input);
  }

  /** Confirms the address from the emailed link and activates the account. */
  @Post(routes.auth.verifyEmail)
  verifyEmail(
    @Body(zodBody(verifyEmailRequestSchema)) input: VerifyEmailRequest,
  ): Promise<UserView> {
    return this.registration.verifyEmail(input.token);
  }

  /** Verifies credentials and sets the session cookies — or asks for a second factor first. */
  @Post(routes.auth.login)
  async login(
    @Body(zodBody(loginRequestSchema)) input: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const outcome = await this.sessions.login(input, originOf(request));
    if ('challengeId' in outcome) {
      return {
        outcome: LOGIN_OUTCOME_MFA_REQUIRED,
        challengeId: outcome.challengeId,
        methods: outcome.methods,
        expiresAt: outcome.expiresAt,
      };
    }
    this.cookies.establish(response, outcome);
    return { outcome: LOGIN_OUTCOME_AUTHENTICATED, user: outcome.user };
  }

  /**
   * Rotates the refresh token: the presented one dies, its successor is set as a cookie.
   * CSRF-checked — this endpoint acts purely on cookies, so it is exactly the shape a
   * cross-site request forgery would take.
   */
  @Post(routes.auth.refresh)
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserView> {
    const success = await this.sessions.refresh(refreshCookieOf(request), originOf(request));
    this.cookies.establish(response, success);
    return success.user;
  }

  /** Ends the caller's session and expires the cookies. */
  @Post(routes.auth.logout)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    await this.sessions.logout(user);
    this.cookies.clear(response);
    return null;
  }

  /** The caller's own identity. */
  @Get(routes.auth.me)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserView> {
    return this.sessions.me(user);
  }
}
