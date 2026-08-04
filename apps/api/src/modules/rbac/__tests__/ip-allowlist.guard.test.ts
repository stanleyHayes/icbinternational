import { HttpStatus, type ExecutionContext } from '@nestjs/common';

import { AdminRole, ErrorCode } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { type AdminPrincipal } from '../admin-auth.types.js';
import { IpAllowlistGuard } from '../ip-allowlist.guard.js';
import { permissionsForRoles } from '../role-catalog.js';

const OFFICE_IP = '203.0.113.10';
const HOME_IP = '198.51.100.7';

const guard = new IpAllowlistGuard();

function principalWith(ipAllowlist: readonly string[]): AdminPrincipal {
  return {
    id: 'adm_test_allowlist',
    email: 'treasury@reliancebank.example',
    fullName: 'Test Treasury',
    roles: [AdminRole.TREASURY],
    permissions: permissionsForRoles([AdminRole.TREASURY]),
    active: true,
    ipAllowlist,
  };
}

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function captureError(request: Record<string, unknown>): AppError {
  let thrown: unknown;
  try {
    guard.canActivate(contextFor(request));
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AppError);
  return thrown as AppError;
}

describe('IpAllowlistGuard', () => {
  it('fails closed when no principal is attached (guard ran out of order)', () => {
    expect(captureError({ ip: OFFICE_IP }).code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('treats an empty allowlist as unrestricted', () => {
    const request = { adminUser: principalWith([]), ip: HOME_IP };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('admits a listed IP', () => {
    const request = { adminUser: principalWith([OFFICE_IP]), ip: OFFICE_IP };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('refuses an unlisted IP with IP_NOT_ALLOWED, a 403', () => {
    const error = captureError({ adminUser: principalWith([OFFICE_IP]), ip: HOME_IP });

    expect(error.code).toBe(ErrorCode.IP_NOT_ALLOWED);
    expect(error.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('matches exactly — a near-miss IP is not on the list', () => {
    const request = { adminUser: principalWith([OFFICE_IP]), ip: `${OFFICE_IP}1` };
    expect(captureError(request).code).toBe(ErrorCode.IP_NOT_ALLOWED);
  });
});
