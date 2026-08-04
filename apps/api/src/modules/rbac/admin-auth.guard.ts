import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { type AdminRequest } from './admin-auth.types.js';
import { AdminTokenService } from './admin-token.service.js';
import { AdminUserService } from './admin-user.service.js';
import { ADMIN_ACCESS_COOKIE } from './rbac.constants.js';
import { adminInactive, adminMfaRequired, adminUnauthenticated } from './rbac.errors.js';

const BEARER_PREFIX = 'bearer ';

/**
 * First link of the admin guard chain: who is calling, and are they still staff.
 *
 * Runs before `IpAllowlistGuard` and `PermissionGuard`. On success it attaches three
 * things to the request, each with a named consumer:
 *
 * - `adminUser` — the principal, for controllers and `@CurrentAdmin()`;
 * - `adminPermissions` — the effective permission set, the shape `modules/gl`'s
 *   `AdminPermissionGuard` and this module's `PermissionGuard` both read;
 * - `user` — the audit interceptor's actor shape, so guarded admin actions are
 *   attributed to an ADMIN actor instead of falling back to SYSTEM.
 *
 * Re-reads the admin row on every request for the same reason the customer guard
 * re-reads the user: a deactivated admin must lose access at the next call, not when
 * their token expires.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AdminTokenService,
    private readonly admins: AdminUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    const claims = await this.tokens.verifyAccess(extractToken(request));
    if (!claims.mfa) throw adminMfaRequired();

    const principal = await this.admins.principalFor(claims.sub);
    if (!principal) throw adminUnauthenticated();
    if (!principal.active) throw adminInactive();

    request.adminUser = principal;
    request.adminPermissions = principal.permissions;
    request.user = {
      id: principal.id,
      fullName: principal.fullName,
      email: principal.email,
      isAdmin: true,
    };
    return true;
  }
}

/**
 * Pulls the admin token off the request, or throws. Cookie first, `Authorization` second.
 *
 * The console's BFF forwards cookies and drops every other credential header, so a
 * browser session arrives in the httpOnly `rb.aat` cookie and no script in the console's
 * origin can read a token. The bearer form stays for callers that are not a browser —
 * integration suites and internal tooling — which is why the guard accepts both.
 */
function extractToken(request: AdminRequest): string {
  const fromCookie: unknown = request.cookies?.[ADMIN_ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;

  const header = request.headers.authorization;
  const token =
    typeof header === 'string' && header.toLowerCase().startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length)
      : '';

  if (token.length === 0) throw adminUnauthenticated();
  return token;
}
