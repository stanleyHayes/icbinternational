import { type Request } from 'express';

import { type AdminRole, type Permission } from '@reliance/contracts';

/**
 * Shapes shared by the admin token service, the guard chain and the controllers.
 *
 * The chain's contract with the rest of the API is the request shape at the bottom of
 * this file. `modules/gl`'s `AdminPermissionGuard` was written against exactly this
 * shape ahead of this module landing; this module now honours it, so either guard can
 * sit behind the same `AdminAuthGuard` without either knowing the other exists.
 */

/** Who the admin is, resolved fresh from the database on every request. */
export interface AdminPrincipal {
  /** Public id, `adm_…`. */
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly roles: readonly AdminRole[];
  /** Effective permissions: role bundles plus per-person grants, de-duplicated. */
  readonly permissions: readonly Permission[];
  /** False when the account is deactivated; the auth guard refuses such principals. */
  readonly active: boolean;
  /** Stored allowlist the `IpAllowlistGuard` enforces. Empty means unrestricted. */
  readonly ipAllowlist: readonly string[];
}

/** Claims on an admin access token. `typ` is always {@link ADMIN_TOKEN_PURPOSE}. */
export interface AdminAccessClaims {
  /** Public admin id, `adm_…`. */
  sub: string;
  typ: string;
  /** True only when TOTP was verified during this login. Mandatory for staff. */
  mfa: boolean;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * An Express request after the admin guard chain has run.
 *
 * `adminPermissions` is the contract with `modules/gl` (see file header). `user` is the
 * shape the audit interceptor reads — set here so every guarded admin action is
 * attributed to an ADMIN actor rather than falling back to SYSTEM.
 */
export type AdminRequest = Request & {
  adminUser?: AdminPrincipal;
  adminPermissions?: readonly string[];
  user?: { id: string; fullName?: string; email?: string; isAdmin?: boolean };
};
