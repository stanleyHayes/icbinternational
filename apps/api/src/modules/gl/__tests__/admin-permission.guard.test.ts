import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode, Permission } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { AdminPermissionGuard } from '../admin-permission.guard.js';
import { RequireAdminPermission } from '../require-admin-permission.decorator.js';

class ProtectedController {
  @RequireAdminPermission(Permission.REPORT_READ)
  readEndpoint(): void {}

  unguardedEndpoint(): void {}
}

const guard = new AdminPermissionGuard(new Reflector());
const readHandler = ProtectedController.prototype.readEndpoint;
const openHandler = ProtectedController.prototype.unguardedEndpoint;

function contextFor(handler: object, request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ProtectedController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function expectGuardError(
  handler: object,
  request: Record<string, unknown>,
  code: ErrorCode,
): void {
  let thrown: unknown;
  try {
    guard.canActivate(contextFor(handler, request));
  } catch (error) {
    thrown = error;
  }

  // Asserting on the captured value rather than inside the catch means a guard that
  // wrongly allows the request fails here instead of silently passing an empty block.
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe(code);
}

describe('AdminPermissionGuard', () => {
  it('allows an endpoint with no permission requirement', () => {
    expect(guard.canActivate(contextFor(openHandler, {}))).toBe(true);
  });

  it('rejects an unauthenticated request with UNAUTHENTICATED', () => {
    expectGuardError(readHandler, {}, ErrorCode.UNAUTHENTICATED);
  });

  it('rejects an admin missing the required permission with PERMISSION_DENIED', () => {
    expectGuardError(
      readHandler,
      { adminPermissions: [Permission.TICKET_MANAGE] },
      ErrorCode.PERMISSION_DENIED,
    );
  });

  it('allows an admin holding the required permission', () => {
    const request = { adminPermissions: [Permission.REPORT_READ] };
    expect(guard.canActivate(contextFor(readHandler, request))).toBe(true);
  });
});
