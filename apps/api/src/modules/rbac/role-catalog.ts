/**
 * The role catalogue: which permissions each staff role bundles.
 *
 * This map is the source of truth. The rule it encodes comes straight from the admin
 * contract: a role is a bundle, the permission is the check — guards compare permission
 * strings and never look at role names. The bundle definitions therefore live in exactly
 * one place, here, and resolution fails closed: a role this map does not know resolves to
 * no permissions at all.
 *
 * The `roles` collection is a *mirror* of this map (see `RoleSyncService`), kept so the
 * operations console can list and describe roles without importing server code. It is
 * never consulted when authorising a request — a database row must not be able to grant
 * a permission the code never approved.
 */

import { AdminRole, Permission } from '@reliance/contracts';

/** Every permission that exists. Reserved for SUPER_ADMIN; derived, not typed by hand. */
const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/** Read-only bundles shared by the analyst and auditor families. */
const READ_ONLY_BASE: readonly Permission[] = [
  Permission.CUSTOMER_READ,
  Permission.TRANSACTION_READ,
];

/**
 * The bundles. Adding a permission to a role is a code change with a review, by design —
 * the alternative is a console toggle that silently rewrites the authorisation surface.
 */
export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly Permission[]>> = {
  [AdminRole.SUPER_ADMIN]: ALL_PERMISSIONS,

  [AdminRole.COMPLIANCE_OFFICER]: [
    ...READ_ONLY_BASE,
    Permission.KYC_READ,
    Permission.KYC_DECIDE,
    Permission.AML_READ,
    Permission.AML_DECIDE,
    Permission.AML_RULE_WRITE,
    Permission.REPORT_READ,
    Permission.AUDIT_READ,
  ],

  [AdminRole.KYC_ANALYST]: [...READ_ONLY_BASE, Permission.KYC_READ, Permission.KYC_DECIDE],

  [AdminRole.FRAUD_ANALYST]: [
    ...READ_ONLY_BASE,
    Permission.FRAUD_MANAGE,
    Permission.AML_READ,
    Permission.HOLD_MANAGE,
  ],

  [AdminRole.OPERATIONS]: [
    ...READ_ONLY_BASE,
    Permission.CUSTOMER_WRITE,
    Permission.CUSTOMER_FREEZE,
    Permission.TRANSACTION_REVERSE,
    Permission.HOLD_MANAGE,
    Permission.DISPUTE_MANAGE,
    Permission.CARD_MANAGE,
    Permission.TICKET_MANAGE,
    Permission.JOB_MANAGE,
    Permission.SIMULATION_RUN,
  ],

  [AdminRole.TREASURY]: [
    ...READ_ONLY_BASE,
    Permission.POSTING_INITIATE,
    Permission.POSTING_APPROVE,
    Permission.REPORT_READ,
  ],

  [AdminRole.UNDERWRITER]: [
    ...READ_ONLY_BASE,
    Permission.KYC_READ,
    Permission.LOAN_DECIDE,
    Permission.REPORT_READ,
  ],

  /**
   * Support reads the customer and works their tickets. Nothing more: no freeze, no
   * write, and emphatically no posting powers — the A-06 acceptance test stands on this.
   */
  [AdminRole.SUPPORT_AGENT]: [...READ_ONLY_BASE, Permission.TICKET_MANAGE],

  [AdminRole.CONTENT_EDITOR]: [Permission.CONTENT_WRITE, Permission.CONTENT_PUBLISH],

  [AdminRole.AUDITOR]: [
    ...READ_ONLY_BASE,
    Permission.KYC_READ,
    Permission.AUDIT_READ,
    Permission.REPORT_READ,
  ],
};

/**
 * Resolves the union of permissions a set of roles grants.
 *
 * Unknown role strings are dropped — fail closed. The result is de-duplicated and sorted
 * so two resolution calls over the same roles compare equal, which tests and logs rely on.
 */
export function permissionsForRoles(roles: readonly string[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    const bundle = ROLE_PERMISSIONS[role as AdminRole];
    if (!bundle) continue;
    for (const permission of bundle) granted.add(permission);
  }
  return [...granted].sort(comparePermissions);
}

/**
 * The effective set for one admin: role bundles plus per-person grants.
 *
 * Grants are narrowed against the contract `Permission` values first, so a stale or
 * misspelled grant in the database is dropped rather than honoured — fail closed.
 */
export function effectivePermissions(
  roles: readonly string[],
  grants: readonly string[],
): Permission[] {
  const known = new Set<string>(Object.values(Permission));
  const valid = grants.filter((grant): grant is Permission => known.has(grant));
  return [...new Set<Permission>([...permissionsForRoles(roles), ...valid])].sort(
    comparePermissions,
  );
}

/** Deterministic ordering for permission strings (`resource:action`, plain ASCII). */
function comparePermissions(a: Permission, b: Permission): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
