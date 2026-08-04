import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JobQueueRegistry, JOB_QUEUE } from '../jobs/index.js';

import { FxAlertService } from './fx-alert.service.js';
import { FX_ALERT_INTERVAL_MS, FX_ALERT_JOB } from './fx.constants.js';

/** What one sweep reports back to the queue. */
export interface AlertSweepResult {
  readonly examined: number;
  readonly triggered: number;
}

/**
 * The rate-alert sweep.
 *
 * Alerts are evaluated on a timer rather than on every tick of the feed, and the reason is
 * the customer rather than the machine: a level that is brushed and abandoned inside a
 * minute is noise, and a bank that pushed a notification for it would train people to
 * ignore the ones that matter. A minute of granularity is the resolution the promise is
 * actually made at.
 *
 * The schedule is *upserted* under a fixed key, so restarting the process reuses the
 * existing scheduler instead of stacking a second sweep on top of it.
 */
@Injectable()
export class FxAlertProcessor extends BaseJobProcessor<unknown, AlertSweepResult> {
  constructor(
    clock: ClockService,
    private readonly queues: JobQueueRegistry,
    private readonly alerts: FxAlertService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    await this.queues
      .getQueue(JOB_QUEUE.SCHEDULER)
      .upsertJobScheduler(FX_ALERT_JOB, { every: FX_ALERT_INTERVAL_MS }, { name: FX_ALERT_JOB });
  }

  protected override async handle(job: Job<unknown, AlertSweepResult>): Promise<AlertSweepResult> {
    // The scheduler queue carries every clock-driven job in the bank; this worker answers
    // only for its own and hands the rest back untouched.
    if (job.name !== FX_ALERT_JOB) return { examined: 0, triggered: 0 };

    return this.alerts.evaluate();
  }
}
