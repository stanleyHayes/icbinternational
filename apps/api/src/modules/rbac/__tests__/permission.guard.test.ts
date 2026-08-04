import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AdminRole, ErrorCode, Permission } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { PermissionGuard } from '../permission.guard.js';
import { RequirePermission } from '../require-permission.decorator.js';
import { permissionsForRoles } from '../role-catalog.js';

/**
 * A treasury endpoint, standing in for the real ones the ledger lane will ship. The
 * permission is the one manual-posting approval requires — the thing a support agent
 * must never be able to do.
 */
class TreasuryController {
  @RequirePermission(Permission.POSTING_APPROVE)
  approvePosting(): void {}

  @RequirePermission(Permission.TRANSACTION_READ)
  readMovements(): void {}

  unguarded(): void {}
}

const guard = new PermissionGuard(new Reflector());
const approveHandler = TreasuryController.prototype.approvePosting;
const readHandler = TreasuryController.prototype.readMovements;
const openHandler = TreasuryController.prototype.unguarded;

function contextFor(handler: object, request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TreasuryController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function captureError(handler: object, request: Record<string, unknown>): AppError {
  let thrown: unknown;
  try {
    guard.canActivate(contextFor(handler, request));
  } catch (error) {
    thrown = error;
  }

  // Captured rather than asserted inside the catch, so a guard that wrongly allows the
  // request fails here instead of silently passing an empty block.
  expect(thrown).toBeInstanceOf(AppError);
  return thrown as AppError;
}

/** The exact set a support agent's roles resolve to — not a hand-picked subset. */
const SUPPORT_AGENT_PERMISSIONS = permissionsForRoles([AdminRole.SUPPORT_AGENT]);

describe('PermissionGuard', () => {
  it('A-06 acceptance: a support agent cannot reach a treasury endpoint — 403', () => {
    const error = captureError(approveHandler, { adminPermissions: SUPPORT_AGENT_PERMISSIONS });

    expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(error.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('lets the same support agent reach an endpoint their bundle covers', () => {
    const request = { adminPermissions: SUPPORT_AGENT_PERMISSIONS };
    expect(guard.canActivate(contextFor(readHandler, request))).toBe(true);
  });

  it('admits a treasury officer to the treasury endpoint', () => {
    const request = { adminPermissions: permissionsForRoles([AdminRole.TREASURY]) };
    expect(guard.canActivate(contextFor(approveHandler, request))).toBe(true);
  });

  it('rejects an unauthenticated request with UNAUTHENTICATED — fail closed', () => {
    expect(captureError(approveHandler, {}).code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('rejects even a super-set bundle that lacks the one required permission', () => {
    const almost = permissionsForRoles([AdminRole.TREASURY]).filter(
      (permission) => permission !== Permission.POSTING_APPROVE,
    );
    expect(captureError(approveHandler, { adminPermissions: almost }).code).toBe(
      ErrorCode.PERMISSION_DENIED,
    );
  });

  it('allows an endpoint with no permission requirement', () => {
    expect(guard.canActivate(contextFor(openHandler, {}))).toBe(true);
  });
});
