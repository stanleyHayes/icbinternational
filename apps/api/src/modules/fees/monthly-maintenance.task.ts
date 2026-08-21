import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask } from '../jobs/index.js';

import { MAINTENANCE_JOB_NAME, MAINTENANCE_SWEEP_INTERVAL_MS } from './fees.constants.js';
import { MaintenanceFeeService, type MaintenanceSweepResult } from './maintenance-fee.service.js';

/**
 * The scheduled charge of due monthly maintenance fees.
 *
 * Was a BullMQ repeatable job on the Redis-backed scheduler queue. Idempotency lives in
 * `MaintenanceFeeService` against its own per-period claim, so a repeated or overlapping pass
 * charges nobody twice — which is what makes an interval a safe substitute for a queue here.
 */
@Injectable()
export class MonthlyMaintenanceTask extends BaseScheduledTask<MaintenanceSweepResult> {
  constructor(
    clock: ClockService,
    private readonly maintenance: MaintenanceFeeService,
  ) {
    super(clock, { name: MAINTENANCE_JOB_NAME, intervalMs: MAINTENANCE_SWEEP_INTERVAL_MS });
  }

  protected override run(): Promise<MaintenanceSweepResult> {
    return this.maintenance.chargeDueMaintenance();
  }
}
