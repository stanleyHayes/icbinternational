import { SetMetadata, type CustomDecorator } from '@nestjs/common';

import { type Permission } from '@reliance/contracts';

import { ADMIN_PERMISSION_KEY } from './gl.constants.js';

/**
 * Declares the admin permission an endpoint requires, enforced by `AdminPermissionGuard`.
 *
 * Permissions are compared as explicit strings, never derived from a role name — that is
 * the rule the admin contract encodes, and the guard honours it verbatim.
 */
export function RequireAdminPermission(permission: Permission): CustomDecorator {
  return SetMetadata(ADMIN_PERMISSION_KEY, permission);
}
