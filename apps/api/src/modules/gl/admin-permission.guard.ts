import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode, Permission } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { ADMIN_PERMISSION_KEY } from './gl.constants.js';

/**
 * The shape the admin auth layer (A-06) promises to put on the request.
 *
 * Until that module lands, nothing populates `adminPermissions`, and this guard fails
 * closed: every guarded endpoint answers 401 rather than 200. That is the safe direction
 * for a guard waiting on its counterpart — a chart of accounts must never be writable by
 * an unauthenticated caller because a dependency was not finished yet.
 */
interface AdminRequest {
  adminPermissions?: readonly string[];
}

/**
 * Enforces `@RequireAdminPermission()` on the chart-of-accounts endpoints.
 *
 * The check is a permission-string comparison, never a role lookup: a role is a bundle,
 * the permission is the check.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission>(ADMIN_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const held = request.adminPermissions;

    if (!held) {
      throw new AppError({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'This endpoint requires an authenticated administrator',
      });
    }
    if (!held.includes(required)) {
      throw new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        message: `This endpoint requires the ${required} permission`,
        context: { required },
      });
    }
    return true;
  }
}
