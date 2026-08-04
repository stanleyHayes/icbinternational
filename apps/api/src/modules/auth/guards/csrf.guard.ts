import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

import { CSRF_HEADER } from '@reliance/contracts';

import { CsrfService } from '../csrf.service.js';
import { csrfCookieOf, headerValue } from '../support/requests.js';

/**
 * Enforces the double-submit CSRF check on cookie-authenticated mutations.
 *
 * Apply it to endpoints that act on cookies rather than on an `Authorization` header:
 * those are the requests a cross-site attacker can trick a browser into making. Login and
 * registration are exempt — no auth cookie exists yet, so there is nothing to ride on.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  /** @throws {AppError} `FORBIDDEN` when the header and cookie do not match, or either is missing. */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.csrf.assert(headerValue(request, CSRF_HEADER), csrfCookieOf(request));
    return true;
  }
}
