import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JobQueueRegistry, JOB_QUEUE } from '../jobs/index.js';

import { BILL_REFUND_SWEEP_JOB, REFUND_SWEEP_INTERVAL_MS } from './bill-pay.constants.js';
import { BillRefundSweeperService, type RefundSweepResult } from './bill-refund-sweeper.service.js';

/** Nothing was owing on this pass. */
const NOTHING_STRANDED: RefundSweepResult = { stranded: 0, refunded: 0 };

/**
 * The scheduled run of the refund sweep.
 *
 * Registered on the scheduler queue the same way the mandate collection and interest accrual
 * sweeps are, so it appears in Bull Board, retries with the platform's backoff and
 * dead-letters like everything else rather than being a `setInterval` nobody can see.
 *
 * The schedule is wall time — Redis cannot read the bank's clock, and that boundary is
 * documented on `BaseJobProcessor`. Everything the sweep *decides* is business time, taken
 * from `ClockService` inside {@link BillRefundSweeperService.sweep}.
 */
@Injectable()
export class BillRefundSweepProcessor extends BaseJobProcessor<unknown, RefundSweepResult> {
  constructor(
    clock: ClockService,
    private readonly queues: JobQueueRegistry,
    private readonly sweeper: BillRefundSweeperService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    await this.queues
      .getQueue(JOB_QUEUE.SCHEDULER)
      .upsertJobScheduler(
        BILL_REFUND_SWEEP_JOB,
        { every: REFUND_SWEEP_INTERVAL_MS },
        { name: BILL_REFUND_SWEEP_JOB },
      );
  }

  protected override async handle(
    job: Job<unknown, RefundSweepResult>,
  ): Promise<RefundSweepResult> {
    // The scheduler queue carries every clock-driven job in the bank; this worker answers
    // only for its own and hands the rest back untouched.
    if (job.name !== BILL_REFUND_SWEEP_JOB) return NOTHING_STRANDED;

    return this.sweeper.sweep();
  }
}
