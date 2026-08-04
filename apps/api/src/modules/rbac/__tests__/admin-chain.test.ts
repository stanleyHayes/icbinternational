import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { AdminRole, ErrorCode, Permission } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/config.service.js';
import { loadEnvironment } from '../../../config/configuration.js';
import { AdminAuthGuard } from '../admin-auth.guard.js';
import { type AdminPrincipal } from '../admin-auth.types.js';
import { AdminTokenService } from '../admin-token.service.js';
import { AdminUserService } from '../admin-user.service.js';
import { IpAllowlistGuard } from '../ip-allowlist.guard.js';
import { PermissionGuard } from '../permission.guard.js';
import { RequirePermission } from '../require-permission.decorator.js';
import { permissionsForRoles } from '../role-catalog.js';

const ACCESS_SECRET = 'admin-chain-test-access-secret-0123456789';
const BEARER = (token: string) => `Bearer ${token}`;
const TWENTY_MINUTES_MS = 20 * 60 * 1000;

/** A treasury endpoint: the thing a support agent must never reach. */
class TreasuryController {
  @RequirePermission(Permission.POSTING_APPROVE)
  approvePosting(): void {}
}

const approveHandler = TreasuryController.prototype.approvePosting;

/** The client IP every chain request in this file arrives from (TEST-NET-2, RFC 5737). */
const CLIENT_IP = '198.51.100.10';

function makeConfig(): AppConfigService {
  const env = loadEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27317/?replicaSet=rs0',
    REDIS_URL: 'redis://localhost:6579',
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: 'admin-chain-test-refresh-secret-012345678',
    CSRF_SECRET: 'admin-chain-csrf',
    ENCRYPTION_KEY: 'admin-chain-encryption-key-012345678',
  } as unknown as NodeJS.ProcessEnv);
  return new AppConfigService(env);
}

function principalFor(role: AdminRole, overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    id: `adm_test_${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@reliancebank.example`,
    fullName: `Test ${role}`,
    roles: [role],
    permissions: permissionsForRoles([role]),
    active: true,
    ipAllowlist: [],
    ...overrides,
  };
}

const store = new Map<string, AdminPrincipal>();
const admins = {
  principalFor: (id: string) => Promise.resolve(store.get(id) ?? null),
} as unknown as AdminUserService;

const clock = new ClockService();
const jwt = new JwtService();
const tokens = new AdminTokenService(jwt, makeConfig(), clock);
const authGuard = new AdminAuthGuard(tokens, admins);
const ipGuard = new IpAllowlistGuard();
const permissionGuard = new PermissionGuard(new Reflector());

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => approveHandler,
    getClass: () => TreasuryController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Runs the full chain in order; the request object returns with everything attached. */
async function runChain(request: Record<string, unknown>): Promise<void> {
  const context = contextFor(request);
  await authGuard.canActivate(context);
  ipGuard.canActivate(context);
  permissionGuard.canActivate(context);
}

async function captureChainError(request: Record<string, unknown>): Promise<AppError> {
  let thrown: unknown;
  try {
    await runChain(request);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AppError);
  return thrown as AppError;
}

async function tokenFor(principal: AdminPrincipal, mfaVerified = true): Promise<string> {
  store.set(principal.id, principal);
  return tokens.signAccess({ adminId: principal.id, mfaVerified });
}

beforeEach(() => {
  store.clear();
  clock.reset();
});

describe('the admin guard chain (real JWTs, in-memory admin store)', () => {
  it('A-06 acceptance: a support agent is refused a treasury endpoint with a 403', async () => {
    const support = principalFor(AdminRole.SUPPORT_AGENT);
    const request = { headers: { authorization: BEARER(await tokenFor(support)) }, ip: CLIENT_IP };

    const error = await captureChainError(request);

    expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(error.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('admits a treasury officer to the same endpoint', async () => {
    const officer = principalFor(AdminRole.TREASURY);
    const request = { headers: { authorization: BEARER(await tokenFor(officer)) }, ip: CLIENT_IP };

    await expect(runChain(request)).resolves.toBeUndefined();
  });

  it('populates the audit actor shape so admin actions are attributed', async () => {
    const officer = principalFor(AdminRole.TREASURY);
    const request: Record<string, unknown> = {
      headers: { authorization: BEARER(await tokenFor(officer)) },
      ip: CLIENT_IP,
    };

    await runChain(request);

    expect(request.user).toEqual({
      id: officer.id,
      fullName: officer.fullName,
      email: officer.email,
      isAdmin: true,
    });
    expect(request.adminPermissions).toEqual(officer.permissions);
  });

  it('rejects a customer access token as out of scope', async () => {
    const nowSeconds = Math.floor(clock.timestamp() / 1000);
    const customerToken = await jwt.signAsync(
      {
        sub: 'usr_1',
        typ: 'access',
        sid: 'ses_1',
        did: null,
        jti: 'j',
        iat: nowSeconds,
        exp: nowSeconds + 900,
      },
      { secret: ACCESS_SECRET },
    );

    const error = await captureChainError({ headers: { authorization: BEARER(customerToken) } });
    expect(error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('rejects an admin token whose login never verified TOTP', async () => {
    const officer = principalFor(AdminRole.TREASURY);
    const token = await tokenFor(officer, false);

    const error = await captureChainError({ headers: { authorization: BEARER(token) } });
    expect(error.code).toBe(ErrorCode.MFA_REQUIRED);
  });

  it('rejects a deactivated admin even with a valid token', async () => {
    const officer = principalFor(AdminRole.TREASURY, { active: false });
    const token = await tokenFor(officer);

    const error = await captureChainError({ headers: { authorization: BEARER(token) } });
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(error.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('rejects a token for an admin id that no longer exists', async () => {
    const token = await tokens.signAccess({ adminId: 'adm_test_ghost', mfaVerified: true });

    const error = await captureChainError({ headers: { authorization: BEARER(token) } });
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('rejects a request with no token at all', async () => {
    const error = await captureChainError({ headers: {} });
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('ages tokens with the simulated clock', async () => {
    clock.freezeAt(new Date('2026-01-01T00:00:00.000Z'));
    const officer = principalFor(AdminRole.TREASURY);
    const token = await tokenFor(officer);

    clock.advance(TWENTY_MINUTES_MS);

    const error = await captureChainError({ headers: { authorization: BEARER(token) } });
    expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
    clock.reset();
  });
});
