import { AdminRole, Permission } from '@reliance/contracts';

import { permissionsForRoles, ROLE_PERMISSIONS } from '../role-catalog.js';

describe('role catalogue', () => {
  it('defines a non-empty bundle for every contract AdminRole', () => {
    for (const role of Object.values(AdminRole)) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('contains only contract Permission values in every bundle', () => {
    const known = new Set<string>(Object.values(Permission));
    for (const bundle of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of bundle) expect(known.has(permission)).toBe(true);
    }
  });

  it('grants SUPER_ADMIN every permission that exists', () => {
    const superAdmin = new Set<string>(ROLE_PERMISSIONS[AdminRole.SUPER_ADMIN]);
    for (const permission of Object.values(Permission)) {
      expect(superAdmin.has(permission)).toBe(true);
    }
  });

  it('gives SUPPORT_AGENT no posting powers — the A-06 acceptance premise', () => {
    const support = new Set<string>(ROLE_PERMISSIONS[AdminRole.SUPPORT_AGENT]);
    expect(support.has(Permission.POSTING_INITIATE)).toBe(false);
    expect(support.has(Permission.POSTING_APPROVE)).toBe(false);
    expect(support.has(Permission.TRANSACTION_REVERSE)).toBe(false);
    expect(support.has(Permission.TICKET_MANAGE)).toBe(true);
  });

  it('resolves the union across roles, de-duplicated and sorted', () => {
    const resolved = permissionsForRoles([AdminRole.KYC_ANALYST, AdminRole.SUPPORT_AGENT]);

    expect(resolved).toEqual([...resolved].sort());
    expect(new Set(resolved).size).toBe(resolved.length);
    expect(resolved).toContain(Permission.KYC_DECIDE);
    expect(resolved).toContain(Permission.TICKET_MANAGE);
  });

  it('fails closed on an unknown role string', () => {
    expect(permissionsForRoles(['SUPERUSER', 'root'])).toEqual([]);
  });

  it('drops the unknown role but keeps the known one', () => {
    expect(permissionsForRoles(['root', AdminRole.AUDITOR])).toContain(Permission.AUDIT_READ);
  });
});
