import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';

import { type BillPaymentStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseJobProcessor, JobQueueRegistry, JOB_QUEUE } from '../jobs/index.js';

import { BILL_SUBMISSION_JOB } from './bill-pay.constants.js';
import { type BillSubmissionJob } from './bill-submission.queue.js';
import { BillSubmissionService } from './bill-submission.service.js';

/** What one submission reports back to the queue. */
export interface SubmissionResult {
  readonly paymentId: string;
  /** Absent when the payment had already been handled by another worker. */
  readonly status: BillPaymentStatus | null;
}

/**
 * The worker that talks to billers.
 *
 * It does very little itself, and that is the point: the interesting behaviour — claim,
 * submit, settle or refund — belongs to {@link BillSubmissionService}, which is a plain
 * service and can be tested without Redis. The processor is the seam between BullMQ's retry
 * machinery and that logic, and keeping it thin is what stops "does a failure reverse?" from
 * being a question you need a queue running to answer.
 *
 * A payment that has already been handled returns a null status rather than throwing.
 * Retrying is pointless when the work is done, and dead-lettering a succeeded payment would
 * put an operator in front of a problem that does not exist.
 */
@Injectable()
export class BillPaymentProcessor extends BaseJobProcessor<BillSubmissionJob, SubmissionResult> {
  constructor(
    clock: ClockService,
    queues: JobQueueRegistry,
    private readonly submissions: BillSubmissionService,
  ) {
    super(clock, queues, { queue: JOB_QUEUE.RAILS });
  }

  protected override async handle(
    job: Job<BillSubmissionJob, SubmissionResult>,
  ): Promise<SubmissionResult> {
    // The rails queue carries every external-network job in the bank; this worker answers
    // only for its own and hands the rest back untouched.
    if (job.name !== BILL_SUBMISSION_JOB) {
      return { paymentId: job.data.paymentId, status: null };
    }

    const settled = await this.submissions.submit(job.data.paymentId);
    return { paymentId: job.data.paymentId, status: settled?.status ?? null };
  }
}
