import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';

import { routes, type AdminUser } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/audited.decorator.js';

import { AdminAuthGuard } from './admin-auth.guard.js';
import { adminLoginRequestSchema, type AdminLoginBody } from './admin-auth.schemas.js';
import { type AdminPrincipal, type AdminRequest } from './admin-auth.types.js';
import { AdminCookiesService } from './admin-cookies.service.js';
import { AdminLoginService } from './admin-login.service.js';
import { AdminUserService } from './admin-user.service.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import {
  ADMIN_AUDIT_CAPTURE_FIELDS,
  ADMIN_AUDIT_ENTITY,
  ADMIN_LOGOUT_ROUTE,
} from './rbac.constants.js';
import { adminUnauthenticated } from './rbac.errors.js';

/**
 * Staff sign-in, identity and sign-out.
 *
 * No token appears in a response body: a successful sign-in sets the httpOnly session
 * cookie and answers with the *operator*, which is what the console renders. The
 * permission list on that answer is the resolved one the guards authorise with, so the
 * console cannot show a screen the platform would then refuse.
 *
 * `@AdminEndpoint()` is deliberately absent. These three routes are how an operator
 * *becomes* an admin, so the only guard that can apply is authentication itself, on the
 * two that already require a session.
 */
@Controller()
export class AdminAuthController {
  constructor(
    private readonly logins: AdminLoginService,
    private readonly cookies: AdminCookiesService,
    private readonly admins: AdminUserService,
  ) {}

  /** Verifies password and authenticator code together, and opens the session. */
  @Post(routes.admin.login)
  @Audited({
    action: 'admin.session.open',
    entity: ADMIN_AUDIT_ENTITY,
    captureFields: ADMIN_AUDIT_CAPTURE_FIELDS,
  })
  async login(
    @Body(zodBody(adminLoginRequestSchema)) input: AdminLoginBody,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminUser> {
    const session = await this.logins.signIn({ ...input, ip: request.ip ?? '' });
    this.cookies.establish(response, session.token);

    // The audit interceptor reads its actor off the request, and no guard has run on this
    // one. Without this line every staff sign-in files itself against the system actor —
    // the one event where "who" is the entire point. The request is Express's only
    // request-scoped store, which is why the guard chain attaches the principal the same way.
    // eslint-disable-next-line no-param-reassign
    request.user = {
      id: session.admin.id,
      fullName: session.admin.fullName,
      email: session.admin.email,
      isAdmin: true,
    };

    return session.admin;
  }

  /** The signed-in operator, resolved fresh — never the claims snapshot in their token. */
  @Get(routes.admin.me)
  @UseGuards(AdminAuthGuard)
  async me(@CurrentAdmin() principal: AdminPrincipal): Promise<AdminUser> {
    const admin = await this.admins.describe(principal.id);
    if (!admin) throw adminUnauthenticated();
    return admin;
  }

  /**
   * Ends the session by expiring the cookie.
   *
   * Unguarded on purpose. An operator whose token has just expired still needs the cookie
   * cleared, and a sign-out that answers 401 leaves a stale credential in the browser —
   * the opposite of what the button is for. Nothing here is destructive, and a Lax cookie
   * cannot be cleared by a cross-site request in the first place.
   *
   * Known limit: admin tokens are stateless, so this expires the browser's copy and not
   * the token. Until there is an admin session store to revoke against, a token captured
   * before sign-out stays valid until it expires.
   */
  @Post(ADMIN_LOGOUT_ROUTE)
  logout(@Res({ passthrough: true }) response: Response): null {
    this.cookies.clear(response);
    return null;
  }
}
