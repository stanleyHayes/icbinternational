/**
 * Names shared across the RBAC module.
 *
 * Kept in one file for the same reason every module here keeps one: a metadata key or a
 * collection name is a coupling point, and coupling points should be greppable.
 */

/** Reflector key under which `@RequirePermission()` stores its permission. */
export const REQUIRED_PERMISSION_KEY = 'rbac:requiredPermission';

/** Staff accounts. Spec'd in plan §3.3 alongside `roles`. */
export const ADMIN_USER_COLLECTION = 'admin_users';

/** The role catalogue, mirrored from code so the console can list it. */
export const ROLE_COLLECTION = 'roles';

/**
 * Purpose claim on an admin access token.
 *
 * Distinct from every customer `typ` in `modules/auth`, so a customer token presented to
 * an admin endpoint fails verification and vice versa. This string is the admin scope
 * separation: the guards enforce it on every request, not just at login.
 */
export const ADMIN_TOKEN_PURPOSE = 'admin-access';

/** Deterministic public id for a catalogue role row, e.g. `rol_support_agent`. */
export const roleIdFor = (name: string): string => `rol_${name.toLowerCase()}`;

/** Maximum entries an admin's IP allowlist may hold. A guard against typo-sprawl. */
export const MAX_ALLOWLIST_ENTRIES = 32;
