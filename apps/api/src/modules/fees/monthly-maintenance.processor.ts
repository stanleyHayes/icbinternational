import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JOB_QUEUE, JobQueueRegistry } from '../jobs/index.js';

import { MAINTENANCE_JOB_NAME, MAINTENANCE_SWEEP_INTERVAL_MS } from './fees.constants.js';
import { MaintenanceFeeService, type MaintenanceSweepResult } from './maintenance-fee.service.js';

/**
 * Drives the monthly maintenance sweep from the scheduler queue.
 *
 * The schedule lives on the wall clock (BullMQ cannot see the simulated one), but which
 * month is due is decided inside the sweep from `ClockService` — so an hourly wake is
 * just a prompt, and advancing the bank's clock a month charges exactly one month. The
 * sweep itself is idempotent per `(account, period)`, which makes BullMQ's retries and
 * at-least-once delivery safe by construction.
 */
@Injectable()
export class MonthlyMaintenanceProcessor extends BaseJobProcessor<unknown, MaintenanceSweepResult> {
  constructor(
    clock: ClockService,
    private readonly queues: JobQueueRegistry,
    private readonly maintenance: MaintenanceFeeService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    await this.queues
      .getQueue(JOB_QUEUE.SCHEDULER)
      .upsertJobScheduler(
        MAINTENANCE_JOB_NAME,
        { every: MAINTENANCE_SWEEP_INTERVAL_MS },
        { name: MAINTENANCE_JOB_NAME },
      );
  }

  protected override async handle(
    job: Job<unknown, MaintenanceSweepResult>,
  ): Promise<MaintenanceSweepResult> {
    // The scheduler queue carries every clock-driven job; this worker answers only for its own.
    if (job.name !== MAINTENANCE_JOB_NAME) {
      return { period: '', scanned: 0, charged: 0, waived: 0, skipped: 0, failed: 0 };
    }

    return this.maintenance.chargeDueMaintenance();
  }
}
