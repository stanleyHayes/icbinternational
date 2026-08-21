import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask } from '../jobs/index.js';

import { FxAlertService } from './fx-alert.service.js';
import { FX_ALERT_INTERVAL_MS, FX_ALERT_JOB } from './fx.constants.js';

/** What one alert pass examined and fired. */
export interface AlertSweepResult {
  readonly examined: number;
  readonly triggered: number;
}

/**
 * The scheduled evaluation of standing FX rate alerts.
 *
 * Was a BullMQ repeatable job on the Redis-backed scheduler queue. The cadence is unchanged;
 * what it lost is retry/backoff and dead-lettering — see `BaseScheduledTask`. A failed pass is
 * logged and the next tick re-evaluates the same alerts, because the sweep reads its due set
 * from MongoDB rather than from a job payload.
 */
@Injectable()
export class FxAlertTask extends BaseScheduledTask<AlertSweepResult> {
  constructor(
    clock: ClockService,
    private readonly alerts: FxAlertService,
  ) {
    super(clock, { name: FX_ALERT_JOB, intervalMs: FX_ALERT_INTERVAL_MS });
  }

  protected override run(): Promise<AlertSweepResult> {
    return this.alerts.evaluate();
  }
}
