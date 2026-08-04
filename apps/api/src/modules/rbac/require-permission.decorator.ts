import { SetMetadata, type CustomDecorator } from '@nestjs/common';

import { type Permission } from '@reliance/contracts';

import { REQUIRED_PERMISSION_KEY } from './rbac.constants.js';

/**
 * Declares the admin permission an endpoint requires, enforced by `PermissionGuard`.
 *
 * The argument is a contract `Permission` value, so a renamed or removed permission is a
 * compile error at every endpoint that asked for it. May be applied to a handler or to a
 * whole controller; handler-level wins when both are present.
 */
export function RequirePermission(permission: Permission): CustomDecorator {
  return SetMetadata(REQUIRED_PERMISSION_KEY, permission);
}
