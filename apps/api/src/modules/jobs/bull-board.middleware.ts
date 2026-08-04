import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { HttpStatus } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

import { ErrorCode, Permission } from '@reliance/contracts';

/** The shape the admin auth layer (A-06) promises to put on the request. */
interface AdminScopedRequest extends Request {
  adminPermissions?: readonly string[];
}

/** Options for {@link createBullBoardHandlers}. */
export interface BullBoardOptions {
  /** Queues shown on the board — the platform queues and their DLQs. */
  readonly queues: readonly Queue[];
  /** Absolute mount path including the API prefix, e.g. `/v1/admin/queues`. */
  readonly basePath: string;
}

/**
 * Builds the Bull Board UI as express middleware, gated on `job:manage`.
 *
 * The gate mirrors `AdminPermissionGuard`: it reads `request.adminPermissions`, which
 * the admin auth layer (A-06) will populate, and **fails closed** until then — an
 * unauthenticated caller gets 401, an authenticated admin without the permission 403.
 * Bodies follow the contract error envelope so the admin console parses them like any
 * other API error.
 *
 * Mounting is the module's job (see `JobsModule.configure`), so no `main.ts` change is
 * required. One production caveat lives with the operator, not the code: helmet's CSP
 * blocks Bull Board's inline assets — relax it for the board route or serve the UI
 * from the admin console origin.
 */
export function createBullBoardHandlers(options: BullBoardOptions): RequestHandler[] {
  const adapter = new ExpressAdapter();
  adapter.setBasePath(options.basePath);
  createBullBoard({
    queues: options.queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter: adapter,
  });
  return [requireJobManagePermission, adapter.getRouter()];
}

/** Fails closed: only an admin holding `job:manage` reaches the board. */
function requireJobManagePermission(
  request: AdminScopedRequest,
  response: Response,
  next: NextFunction,
): void {
  const held = request.adminPermissions;
  if (!held) {
    sendGateError(response, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED);
    return;
  }
  if (!held.includes(Permission.JOB_MANAGE)) {
    sendGateError(response, HttpStatus.FORBIDDEN, ErrorCode.PERMISSION_DENIED);
    return;
  }
  next();
}

function sendGateError(response: Response, status: number, code: ErrorCode): void {
  const message =
    code === ErrorCode.UNAUTHENTICATED
      ? 'This endpoint requires an authenticated administrator'
      : `This endpoint requires the ${Permission.JOB_MANAGE} permission`;
  response.status(status).json({ error: { code, message } });
}
