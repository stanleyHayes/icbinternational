import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';

import { AdminRole, adminUserSchema, ErrorCode, Permission } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { AdminAuthGuard } from '../admin-auth.guard.js';
import { AdminTokenService } from '../admin-token.service.js';
import { AdminUserService } from '../admin-user.service.js';
import { IpAllowlistGuard } from '../ip-allowlist.guard.js';
import { PermissionGuard } from '../permission.guard.js';
import { RbacModule } from '../rbac.module.js';
import { RequirePermission } from '../require-permission.decorator.js';
import { RoleSyncService } from '../role-sync.service.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_rbac_test';
process.env.JWT_ACCESS_SECRET = 'rbac-integration-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'rbac-integration-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'rbac-integration-csrf';
process.env.ENCRYPTION_KEY = 'rbac-integration-encryption-key-012345';

jest.setTimeout(240_000);

/** A treasury endpoint, wired exactly as a shipped one would be. */
class TreasuryController {
  @RequirePermission(Permission.POSTING_APPROVE)
  approvePosting(): void {}
}

const approveHandler = TreasuryController.prototype.approvePosting;

describe('RBAC module (integration, real Mongo replica set)', () => {
  let moduleRef: TestingModule;
  let admins: AdminUserService;
  let roles: RoleSyncService;
  let tokens: AdminTokenService;
  let authGuard: AdminAuthGuard;

  const ipGuard = new IpAllowlistGuard();
  const permissionGuard = new PermissionGuard(new Reflector());

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ClockModule, DatabaseModule, RbacModule],
    }).compile();

    admins = moduleRef.get(AdminUserService);
    roles = moduleRef.get(RoleSyncService);
    tokens = moduleRef.get(AdminTokenService);
    authGuard = moduleRef.get(AdminAuthGuard);
  });

  afterAll(async () => {
    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
    await moduleRef.close();
  });

  async function runChain(token: string): Promise<void> {
    const request = { headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1' };
    const context = {
      getHandler: () => approveHandler,
      getClass: () => TreasuryController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await authGuard.canActivate(context);
    ipGuard.canActivate(context);
    permissionGuard.canActivate(context);
  }

  async function chainError(token: string): Promise<AppError> {
    let thrown: unknown;
    try {
      await runChain(token);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    return thrown as AppError;
  }

  it('provisions a support agent and resolves their effective permissions from storage', async () => {
    const principal = await admins.provision({
      email: 'Support.Agent@RelianceBank.example',
      fullName: 'Support Agent',
      roles: [AdminRole.SUPPORT_AGENT],
    });

    expect(principal.id.startsWith('adm_')).toBe(true);
    expect(principal.permissions).toContain(Permission.TICKET_MANAGE);
    expect(principal.permissions).not.toContain(Permission.POSTING_APPROVE);

    const resolved = await admins.principalFor(principal.id);
    expect(resolved?.email).toBe('support.agent@reliancebank.example');
  });

  it('describes an admin as a contract-valid DTO', async () => {
    const principal = await admins.provision({
      email: 'treasury@reliancebank.example',
      fullName: 'Treasury Officer',
      roles: [AdminRole.TREASURY],
      ipAllowlist: ['127.0.0.1'],
    });

    const dto = await admins.describe(principal.id);
    expect(() => adminUserSchema.parse(dto)).not.toThrow();
    expect(dto?.mfaEnrolled).toBe(false);
  });

  it('mirrors the role catalogue into the roles collection, idempotently', async () => {
    const first = await roles.syncCatalogue();
    const second = await roles.syncCatalogue();

    expect(first.synced).toBe(Object.keys(AdminRole).length);
    expect(second.synced).toBe(first.synced);
  });

  it('A-06 acceptance, repo-backed: support agent → treasury endpoint → 403', async () => {
    const support = await admins.provision({
      email: 'agent@reliancebank.example',
      fullName: 'Chained Agent',
      roles: [AdminRole.SUPPORT_AGENT],
    });
    const token = await tokens.signAccess({ adminId: support.id, mfaVerified: true });

    const error = await chainError(token);

    expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(error.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('admits the treasury officer through the same chain', async () => {
    const officer = await admins.provision({
      email: 'officer@reliancebank.example',
      fullName: 'Chained Officer',
      roles: [AdminRole.TREASURY],
    });
    const token = await tokens.signAccess({ adminId: officer.id, mfaVerified: true });

    await expect(runChain(token)).resolves.toBeUndefined();
  });

  it('cuts a deactivated admin off at the next request, mid-token', async () => {
    const officer = await admins.provision({
      email: 'departing@reliancebank.example',
      fullName: 'Departing Officer',
      roles: [AdminRole.TREASURY],
    });
    const token = await tokens.signAccess({ adminId: officer.id, mfaVerified: true });
    await expect(runChain(token)).resolves.toBeUndefined();

    await admins.deactivate(officer.id);

    const error = await chainError(token);
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
  });
});
