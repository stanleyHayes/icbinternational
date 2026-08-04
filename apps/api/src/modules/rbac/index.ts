/**
 * Public surface of the RBAC module.
 *
 * Consumers outside this directory import from here, never from file paths — the guard
 * chain, its decorators, and the services the admin login flow and seed lane need.
 */

export { RbacModule } from './rbac.module.js';

// The guard chain and its decorators — the authorisation surface.
export { AdminAuthGuard } from './admin-auth.guard.js';
export { IpAllowlistGuard } from './ip-allowlist.guard.js';
export { PermissionGuard } from './permission.guard.js';
export { RequirePermission } from './require-permission.decorator.js';
export { AdminEndpoint } from './admin-endpoint.decorator.js';
export { CurrentAdmin } from './current-admin.decorator.js';

// Services for the admin login flow (A-05/K-01) and the seed lane (L-01).
export { AdminTokenService } from './admin-token.service.js';
export { AdminUserService, type ProvisionAdminInput } from './admin-user.service.js';
export { RoleSyncService } from './role-sync.service.js';

// The catalogue, for anything that lists roles without a database.
export { ROLE_PERMISSIONS, permissionsForRoles } from './role-catalog.js';

// Shared shapes.
export {
  type AdminPrincipal,
  type AdminAccessClaims,
  type AdminRequest,
} from './admin-auth.types.js';
