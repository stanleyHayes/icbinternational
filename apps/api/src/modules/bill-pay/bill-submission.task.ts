import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask, DEFAULT_SWEEP_BATCH_SIZE } from '../jobs/index.js';

import { BILL_SUBMISSION_JOB, SUBMISSION_SWEEP_INTERVAL_MS } from './bill-pay.constants.js';
import { BillPaymentStore } from './bill-payment.store.js';
import { BillSubmissionService } from './bill-submission.service.js';

/** What one submission pass claimed and settled. */
export interface SubmissionSweepResult {
  readonly due: number;
  readonly submitted: number;
}

/**
 * Gets due payments onto the rails.
 *
 * This replaced a BullMQ job whose *delay* carried the schedule: a payment booked for next
 * Tuesday became a delayed job, and Redis held it until then. Nothing holds it now, so the
 * schedule is read back out of the payment itself — `dueForSubmission` returns exactly the
 * payments whose time has arrived and which nobody has submitted.
 *
 * That is a better fit than a timer would have been. A `setTimeout` for next Tuesday dies with
 * the process; the due set is in MongoDB and survives a restart, a redeploy, and the free
 * instance spinning down overnight. It also means a payment booked while the API was asleep is
 * picked up on the next pass rather than lost.
 *
 * Immediacy comes from {@link kick}: a payment due right now triggers an out-of-band pass
 * instead of waiting for the tick. The interval remains the backstop, so a missed kick costs
 * latency, never the payment.
 */
@Injectable()
export class BillSubmissionTask extends BaseScheduledTask<SubmissionSweepResult> {
  constructor(
    clock: ClockService,
    private readonly payments: BillPaymentStore,
    private readonly submissions: BillSubmissionService,
  ) {
    super(clock, { name: BILL_SUBMISSION_JOB, intervalMs: SUBMISSION_SWEEP_INTERVAL_MS });
  }

  /**
   * Runs a pass soon, without waiting for the next tick.
   *
   * Deliberately not awaited by callers: a request that books a payment should not block on
   * the biller answering. A failure is logged by `runOnce` and retried by the next tick.
   */
  kick(): void {
    void this.runOnce();
  }

  protected override async run(): Promise<SubmissionSweepResult> {
    const due = await this.payments.dueForSubmission(this.clock.now(), DEFAULT_SWEEP_BATCH_SIZE);

    let submitted = 0;
    for (const payment of due) {
      // One payment's failure must not strand the rest of the batch: the claim inside
      // BillSubmissionService means a retried payment resumes rather than double-submits.
      const settled = await this.submissions.submit(payment.id);
      if (settled !== null) submitted += 1;
    }

    return { due: due.length, submitted };
  }
}
