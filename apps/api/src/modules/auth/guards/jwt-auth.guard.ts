import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { unauthenticated } from '../auth.errors.js';
import { type AuthenticatedRequest } from '../auth.types.js';
import { SessionService } from '../session.service.js';
import { accessCookieOf, headerValue } from '../support/requests.js';
import { TokenService } from '../token.service.js';
import { UsersService } from '../users/index.js';

const BEARER_PREFIX = 'bearer ';

/**
 * Authenticates a request by its access token.
 *
 * The token is read from the httpOnly `rb.at` cookie first, with an `Authorization:
 * Bearer` fallback for non-browser clients. Beyond the signature, the guard re-reads the
 * user and re-checks their status on every request: an access token outlives a suspension
 * by up to fifteen minutes otherwise, and "suspended but still calling the API" is not a
 * state a bank should have.
 *
 * On success the identity lands on `request.user`, where `@CurrentUser()` picks it up.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * @throws {AppError} `UNAUTHENTICATED` when no token is present or its session has
   *   ended; `TOKEN_EXPIRED` / `TOKEN_INVALID` from verification; the status rejections
   *   for a non-active account.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = extractAccessToken(request);
    if (!token) throw unauthenticated();

    const claims = await this.tokens.verifyAccess(token);
    if (!(await this.sessions.isLive(claims.sid))) throw unauthenticated();

    const user = await this.users.requireById(claims.sub);
    this.users.assertCanAuthenticate(user);

    request.user = { userId: claims.sub, sessionId: claims.sid, deviceId: claims.did };
    return true;
  }
}

/** Cookie first, Bearer header second. */
function extractAccessToken(request: AuthenticatedRequest): string | undefined {
  const fromCookie = accessCookieOf(request);
  if (fromCookie) return fromCookie;

  const header = headerValue(request, 'authorization');
  if (header?.toLowerCase().startsWith(BEARER_PREFIX)) return header.slice(BEARER_PREFIX.length);
  return undefined;
}
