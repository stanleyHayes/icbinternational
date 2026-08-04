import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { type AdminRequest } from './admin-auth.types.js';
import { adminUnauthenticated, ipNotAllowed } from './rbac.errors.js';

/**
 * Second link of the admin guard chain: where the call is coming from.
 *
 * Enforces the per-admin `ipAllowlist` against the client IP. The semantics, stated
 * plainly because they are a choice: **an empty allowlist is unrestricted.** A non-empty
 * one is exact-match only — no CIDR expansion, because an exact list is auditable at a
 * glance and a CIDR typo is a door. Range support is a documented deferral, not a gap.
 *
 * Runs after `AdminAuthGuard`; with no principal on the request it fails closed. The
 * client IP comes from `request.ip`, which Express derives honouring the app's
 * `trust proxy` setting — spoofing it is a proxy-configuration problem, not this
 * guard's, and the socket address is the honest fallback.
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const principal = request.adminUser;

    if (!principal) throw adminUnauthenticated();
    if (principal.ipAllowlist.length === 0) return true;

    const clientIp = request.ip ?? '';
    if (!principal.ipAllowlist.includes(clientIp)) throw ipNotAllowed();
    return true;
  }
}
