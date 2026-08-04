import { applyDecorators, UseGuards } from '@nestjs/common';

import { type Permission } from '@reliance/contracts';

import { AdminAuthGuard } from './admin-auth.guard.js';
import { IpAllowlistGuard } from './ip-allowlist.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { RequirePermission } from './require-permission.decorator.js';

/**
 * The whole admin guard chain in one decorator.
 *
 * `@AdminEndpoint(permission)` on a handler or controller means: authenticate the staff
 * token (scope-checked, MFA-claimed, account still active), enforce the caller's stored
 * IP allowlist, then require the named permission. Three guards applied in that order —
 * authentication before network policy before authorisation, so each refusal reports the
 * earliest true reason.
 *
 * New admin controllers should reach for this rather than assembling `@UseGuards` by
 * hand; the chain's order is a security property and should not be re-derived per route.
 */
export function AdminEndpoint(permission: Permission): MethodDecorator & ClassDecorator {
  return applyDecorators(
    RequirePermission(permission),
    UseGuards(AdminAuthGuard, IpAllowlistGuard, PermissionGuard),
  );
}
