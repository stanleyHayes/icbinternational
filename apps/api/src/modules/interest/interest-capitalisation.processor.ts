import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JOB_QUEUE, JobQueueRegistry } from '../jobs/index.js';

import {
  InterestCapitalisationService,
  type CapitalisationRunResult,
} from './interest-capitalisation.service.js';
import { MONTHLY_CAPITALISATION_JOB } from './interest.constants.js';

/** Payload of the monthly capitalisation job. `period` pins a replay; omit for last month. */
export interface CapitalisationJobData {
  readonly period?: string;
}

/**
 * The worker that turns a month of accrual into posted interest.
 *
 * Thin on purpose, like its accrual sibling: the payout rules live in
 * {@link InterestCapitalisationService}, and this is only the seam to the queue.
 *
 * Operational ordering matters: on the first of the month the capitalisation must run
 * *before* that day's accrual, so the new month's first day never leaks into the old
 * period's payout. The simulation control room owns the ordering; this worker simply
 * refuses nothing — replaying an already-settled period is a no-op by construction.
 */
@Injectable()
export class InterestCapitalisationProcessor extends BaseJobProcessor<
  CapitalisationJobData,
  CapitalisationRunResult | null
> {
  constructor(
    clock: ClockService,
    queues: JobQueueRegistry,
    private readonly capitalisation: InterestCapitalisationService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  protected override async handle(
    job: Job<CapitalisationJobData, CapitalisationRunResult | null>,
  ): Promise<CapitalisationRunResult | null> {
    if (job.name !== MONTHLY_CAPITALISATION_JOB) return null;
    return this.capitalisation.runMonthlyCapitalisation(job.data.period);
  }
}
