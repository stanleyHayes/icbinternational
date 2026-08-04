import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { Permission, routes } from '@reliance/contracts';

import { AdminPermissionGuard } from '../gl/admin-permission.guard.js';
import { RequireAdminPermission } from '../gl/require-admin-permission.decorator.js';

import { DeadLetterService } from './dead-letter.service.js';
import { type QueueOverview, type ReplayResult } from './jobs.types.js';

/**
 * Operator endpoints for the job platform: queue health plus dead-letter replay.
 *
 * Everything here requires `job:manage`; the guard fails closed until the admin auth
 * layer (A-06) populates `request.adminPermissions`, so these routes answer 401 — not
 * 200 — before then. The Bull Board UI at `/v1/admin/queues` enforces the same rule.
 */
@Controller()
@UseGuards(AdminPermissionGuard)
export class JobsAdminController {
  constructor(private readonly deadLetters: DeadLetterService) {}

  /** `GET /admin/jobs` — per-queue job counts and parked dead letters. */
  @Get(routes.admin.jobs)
  @RequireAdminPermission(Permission.JOB_MANAGE)
  overview(): Promise<QueueOverview[]> {
    return this.deadLetters.overview();
  }

  /**
   * `POST /admin/jobs/:id/replay` — re-enqueues a dead letter on its source queue.
   * The id is the `replayId` from the overview, of the form `<queue>.<dlqJobId>`.
   */
  @Post(routes.admin.replayJob(':id'))
  @RequireAdminPermission(Permission.JOB_MANAGE)
  replay(@Param('id') id: string): Promise<ReplayResult> {
    return this.deadLetters.replay(id);
  }
}
