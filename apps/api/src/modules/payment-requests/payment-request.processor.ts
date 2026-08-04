import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JobQueueRegistry, JOB_QUEUE } from '../jobs/index.js';

import { REQUEST_EXPIRY_INTERVAL_MS, REQUEST_EXPIRY_JOB } from './payment-request.constants.js';
import { PaymentRequestService } from './payment-request.service.js';

/** What one sweep reports back to the queue. */
export interface ExpirySweepResult {
  readonly expired: number;
}

/**
 * The expiry sweep.
 *
 * Requests also expire lazily on read, so this job is not what makes "an expired request
 * cannot be paid" true — the conditional write is. What it makes true is that a requester's
 * list is honest when they open it, rather than a page of `OPEN` rows that quietly change as
 * they scroll, and that somebody who was asked for money last month is told the ask has
 * lapsed instead of being left wondering.
 *
 * The schedule is upserted under a fixed key, so restarting the process reuses the existing
 * scheduler instead of stacking a second sweep on top of it.
 */
@Injectable()
export class PaymentRequestProcessor extends BaseJobProcessor<unknown, ExpirySweepResult> {
  constructor(
    clock: ClockService,
    private readonly queues: JobQueueRegistry,
    private readonly requests: PaymentRequestService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    await this.queues
      .getQueue(JOB_QUEUE.SCHEDULER)
      .upsertJobScheduler(
        REQUEST_EXPIRY_JOB,
        { every: REQUEST_EXPIRY_INTERVAL_MS },
        { name: REQUEST_EXPIRY_JOB },
      );
  }

  protected override async handle(
    job: Job<unknown, ExpirySweepResult>,
  ): Promise<ExpirySweepResult> {
    // The scheduler queue carries every clock-driven job in the bank; this worker answers
    // only for its own and hands the rest back untouched.
    if (job.name !== REQUEST_EXPIRY_JOB) return { expired: 0 };

    return { expired: await this.requests.expireLapsed() };
  }
}
