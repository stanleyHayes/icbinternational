import { Injectable } from '@nestjs/common';
import { type CookieOptions, type Response } from 'express';

import { COOKIE } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';

import { CsrfService } from './csrf.service.js';
import { TokenService } from './token.service.js';

const MILLISECONDS_PER_SECOND = 1000;

/** The token pair a session runs on. */
export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Writes the three auth cookies.
 *
 * `rb.at` and `rb.rt` are httpOnly — no JavaScript may read a credential. `rb.csrf` is
 * readable by design: the double-submit pattern needs the client to echo it in a header.
 * All three share domain, path and SameSite so that clearing them really does clear them;
 * a clear with different attributes leaves the original cookie alive in the browser.
 */
@Injectable()
export class AuthCookiesService {
  constructor(
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
    private readonly csrf: CsrfService,
  ) {}

  /** Sets the access, refresh and CSRF cookies for a freshly minted session. */
  establish(response: Response, tokens: AuthTokenPair): void {
    response.cookie(
      COOKIE.accessToken,
      tokens.accessToken,
      this.options(this.tokens.accessTtlSeconds, true),
    );
    response.cookie(
      COOKIE.refreshToken,
      tokens.refreshToken,
      this.options(this.tokens.refreshTtlSeconds, true),
    );
    response.cookie(
      COOKIE.csrf,
      this.csrf.issue(),
      this.options(this.tokens.refreshTtlSeconds, false),
    );
  }

  /** Expires all three cookies. Called on logout and on password reset. */
  clear(response: Response): void {
    for (const name of [COOKIE.accessToken, COOKIE.refreshToken, COOKIE.csrf]) {
      response.clearCookie(name, this.base());
    }
  }

  private options(ttlSeconds: number, httpOnly: boolean): CookieOptions {
    return { ...this.base(), httpOnly, maxAge: ttlSeconds * MILLISECONDS_PER_SECOND };
  }

  private base(): CookieOptions {
    return {
      domain: this.config.cookies.domain,
      secure: this.config.cookies.secure,
      sameSite: 'lax',
      path: '/',
    };
  }
}
