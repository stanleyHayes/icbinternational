import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type Permission } from '@reliance/contracts';

import { type AdminRequest } from './admin-auth.types.js';
import { REQUIRED_PERMISSION_KEY } from './rbac.constants.js';
import { adminUnauthenticated, permissionDenied } from './rbac.errors.js';

/**
 * Last link of the admin guard chain: does the caller hold the required permission.
 *
 * Enforces `@RequirePermission()`. The check is a permission-string comparison, never a
 * role lookup — a role is a bundle, the permission is the check, per the admin contract.
 *
 * This guard converges with `modules/gl`'s `AdminPermissionGuard`: it reads the same
 * `request.adminPermissions` shape and fails closed the same way, so it is a drop-in
 * replacement at controller level (`@UseGuards(PermissionGuard)` for
 * `@UseGuards(AdminPermissionGuard)`) once a controller moves onto the A-06 chain.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const held = request.adminPermissions;

    if (!held) throw adminUnauthenticated();
    if (!held.includes(required)) throw permissionDenied(required);
    return true;
  }
}
