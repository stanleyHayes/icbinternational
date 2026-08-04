import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { JOB_QUEUE, JobQueueRegistry } from '../jobs/index.js';

import { BILL_SUBMISSION_JOB, MAX_SUBMISSION_ATTEMPTS } from './bill-pay.constants.js';

/** The payload the submission job carries. Only the id — everything else is re-read. */
export interface BillSubmissionJob {
  readonly paymentId: string;
}

/**
 * Getting a payment onto the rails queue, now or later.
 *
 * The job carries the payment's id and nothing else. Re-reading the record inside the job
 * costs one query and buys the guarantee that a retry acts on the payment's *current* state
 * — a payload carrying an amount could refund a figure that had since been corrected, and a
 * payload carrying a status could settle a payment that had already been reversed.
 *
 * A scheduled payment becomes a delay in real milliseconds, computed from the bank's clock
 * at enqueue time. BullMQ schedules on wall time and knows nothing of the simulated clock;
 * that boundary is crossed here, once, rather than in every caller.
 */
@Injectable()
export class BillSubmissionQueue {
  constructor(
    private readonly queues: JobQueueRegistry,
    private readonly clock: ClockService,
  ) {}

  /** Queues a payment for submission, delaying until `runAt` when that is in the future. */
  async enqueue(paymentId: string, runAt?: Date): Promise<void> {
    const delay = Math.max((runAt?.getTime() ?? 0) - this.clock.timestamp(), 0);

    await this.queues.enqueue<BillSubmissionJob>(
      JOB_QUEUE.RAILS,
      BILL_SUBMISSION_JOB,
      { paymentId },
      {
        // The job id is the payment id, so a duplicated enqueue collapses onto the job
        // already waiting instead of submitting the same payment to the biller twice.
        jobId: `${BILL_SUBMISSION_JOB}:${paymentId}`,
        attempts: MAX_SUBMISSION_ATTEMPTS,
        ...(delay > 0 ? { delay } : {}),
      },
    );
  }
}
