import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JOB_QUEUE, JobQueueRegistry } from '../jobs/index.js';

import { InterestAccrualService, type AccrualRunResult } from './interest-accrual.service.js';
import { DAILY_ACCRUAL_JOB } from './interest.constants.js';

/** Payload of the daily accrual job. `asOf` pins a replay; omit for the clock's today. */
export interface AccrualJobData {
  readonly asOf?: string;
}

/**
 * The worker that accrues a day of credit interest across the book.
 *
 * Thin on purpose — the accrual rules live in {@link InterestAccrualService}, a plain
 * service testable without Redis. The processor is only the seam between BullMQ's retry
 * machinery and that logic: it answers for its own job name on the shared scheduler
 * queue and hands every other job back untouched.
 *
 * The payload's `asOf` is what lets the simulation control room replay a date the clock
 * skipped past; the service's stamps make that replay a no-op where the work is done.
 */
@Injectable()
export class InterestAccrualProcessor extends BaseJobProcessor<
  AccrualJobData,
  AccrualRunResult | null
> {
  constructor(
    clock: ClockService,
    queues: JobQueueRegistry,
    private readonly accrual: InterestAccrualService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  protected override async handle(
    job: Job<AccrualJobData, AccrualRunResult | null>,
  ): Promise<AccrualRunResult | null> {
    if (job.name !== DAILY_ACCRUAL_JOB) return null;
    return this.accrual.runDailyAccrual(job.data.asOf);
  }
}
