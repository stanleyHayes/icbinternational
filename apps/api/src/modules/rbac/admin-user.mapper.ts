import { type AdminUser } from '@reliance/contracts';

import { type AdminPrincipal } from './admin-auth.types.js';
import { type AdminUserDoc } from './schemas/admin-user.schema.js';

/**
 * Document + principal → contract DTO.
 *
 * The wire shape's `roles` and `permissions` come from the resolved principal — the same
 * values the guard chain authorises with — so what the console displays and what the API
 * enforces cannot drift apart. The document supplies only what the principal does not
 * carry: timestamps, the active flag and the allowlist.
 */
export function toAdminUserDto(doc: AdminUserDoc, principal: AdminPrincipal): AdminUser {
  return {
    id: principal.id,
    email: principal.email,
    fullName: principal.fullName,
    roles: [...principal.roles],
    permissions: [...principal.permissions],
    active: principal.active,
    mfaEnrolled: doc.mfa.enrolledAt !== null,
    ipAllowlist: [...principal.ipAllowlist],
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}
