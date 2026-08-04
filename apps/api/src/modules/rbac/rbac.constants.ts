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

/**
 * Cookie the operations console's session travels in.
 *
 * A name of its own rather than the contract's `rb.at`. The two token scopes would
 * otherwise share one slot in the browser, and an operator who also banks here would have
 * their customer session overwritten by signing into the console. httpOnly: the console
 * never reads it, its BFF simply forwards it upstream unopened.
 */
export const ADMIN_ACCESS_COOKIE = 'rb.aat';

/**
 * Staff sign-out.
 *
 * The frozen contract names `/admin/auth/login` and `/admin/auth/me` but no sign-out, so
 * the path is declared here beside the two it shares a prefix with rather than typed into
 * the controller. When the contract grows a constant for it, this is the line that goes.
 */
export const ADMIN_LOGOUT_ROUTE = '/admin/auth/logout';

/** Audit entity family for staff sessions. Paired with the operator's `adm_` id. */
export const ADMIN_AUDIT_ENTITY = 'adminUser';

/**
 * What a sign-in records.
 *
 * An allow-list, not a redaction list: the login handler answers with the whole staff DTO,
 * and the resolved permission set is a hundred strings that say nothing about the event.
 */
export const ADMIN_AUDIT_CAPTURE_FIELDS: readonly string[] = [
  'id',
  'email',
  'fullName',
  'roles',
  'active',
];

/** Deterministic public id for a catalogue role row, e.g. `rol_support_agent`. */
export const roleIdFor = (name: string): string => `rol_${name.toLowerCase()}`;

/** Maximum entries an admin's IP allowlist may hold. A guard against typo-sprawl. */
export const MAX_ALLOWLIST_ENTRIES = 32;
