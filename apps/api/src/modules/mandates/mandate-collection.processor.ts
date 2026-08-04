import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JobQueueRegistry, JOB_QUEUE } from '../jobs/index.js';

import { MandateCollectionService } from './mandate-collection.service.js';
import { MANDATE_COLLECTION_JOB, MANDATE_SWEEP_INTERVAL_MS } from './mandate.constants.js';

/** What one sweep reports back to the queue. */
export interface CollectionSweepResult {
  readonly attempted: number;
  readonly collected: number;
}

/**
 * The direct-debit collection sweep.
 *
 * Runs hourly, which is finer than any schedule a mandate can carry, so a collection due at
 * a particular business date is taken on that date rather than whenever the process happens
 * to wake. The sweep is idempotent by construction: a mandate that has been collected has
 * its `nextExpectedAt` moved on inside the same transaction, so the next sweep does not see
 * it.
 *
 * Business time comes from `ClockService`, so advancing the simulated clock a year produces
 * a year of collections. The schedule itself runs on wall time, because Redis cannot see the
 * bank's clock — that boundary is documented on `BaseJobProcessor` and crossed here.
 */
@Injectable()
export class MandateCollectionProcessor extends BaseJobProcessor<unknown, CollectionSweepResult> {
  constructor(
    clock: ClockService,
    private readonly queues: JobQueueRegistry,
    private readonly collections: MandateCollectionService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    await this.queues
      .getQueue(JOB_QUEUE.SCHEDULER)
      .upsertJobScheduler(
        MANDATE_COLLECTION_JOB,
        { every: MANDATE_SWEEP_INTERVAL_MS },
        { name: MANDATE_COLLECTION_JOB },
      );
  }

  protected override async handle(
    job: Job<unknown, CollectionSweepResult>,
  ): Promise<CollectionSweepResult> {
    // The scheduler queue carries every clock-driven job in the bank; this worker answers
    // only for its own and hands the rest back untouched.
    if (job.name !== MANDATE_COLLECTION_JOB) return { attempted: 0, collected: 0 };

    return this.collections.collectDue();
  }
}
