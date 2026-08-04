import { Injectable } from '@nestjs/common';
import { type CookieOptions, type Response } from 'express';

import { AppConfigService } from '../../config/config.service.js';

import { AdminTokenService } from './admin-token.service.js';
import { ADMIN_ACCESS_COOKIE } from './rbac.constants.js';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Writes and clears the one cookie a staff session runs on.
 *
 * The token never appears in a response body. The console's BFF forwards cookies upstream
 * and hands `Set-Cookie` back to the browser, so an httpOnly cookie is the whole delivery
 * mechanism — and what script cannot read, an injection into the console cannot steal.
 *
 * A thin writer over an already-injectable token service, provided by `RbacModule`
 * locally, the same way `MfaModule` keeps `AuthCookiesService` to itself: cookie policy is
 * not something other modules should have to import.
 */
@Injectable()
export class AdminCookiesService {
  constructor(
    private readonly config: AppConfigService,
    private readonly tokens: AdminTokenService,
  ) {}

  /** Sets the session cookie for a freshly issued admin token. */
  establish(response: Response, token: string): void {
    response.cookie(ADMIN_ACCESS_COOKIE, token, {
      ...this.base(),
      httpOnly: true,
      maxAge: this.tokens.accessTtlSeconds * MILLISECONDS_PER_SECOND,
    });
  }

  /** Expires the session cookie. Attributes must match the write, or the browser keeps it. */
  clear(response: Response): void {
    response.clearCookie(ADMIN_ACCESS_COOKIE, this.base());
  }

  private base(): CookieOptions {
    return {
      domain: this.config.cookies.domain,
      secure: this.config.cookies.secure,
      // Lax rather than None, and it is doing real work: the admin chain carries no
      // double-submit token, so the fact that a cross-site POST cannot send a Lax cookie
      // at all is what stands between the console's session and a forged request.
      sameSite: 'lax',
      path: '/',
    };
  }
}
