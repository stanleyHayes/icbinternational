import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask } from '../jobs/index.js';

import { BILL_REFUND_SWEEP_JOB, REFUND_SWEEP_INTERVAL_MS } from './bill-pay.constants.js';
import { BillRefundSweeperService, type RefundSweepResult } from './bill-refund-sweeper.service.js';

/**
 * The scheduled refund of payments that owe the customer money.
 *
 * Was a BullMQ repeatable job on the Redis-backed scheduler queue. What the sweep *decides* is
 * still business time, taken from `ClockService` inside {@link BillRefundSweeperService.sweep};
 * only the cadence is wall time, exactly as it was under BullMQ.
 */
@Injectable()
export class BillRefundSweepTask extends BaseScheduledTask<RefundSweepResult> {
  constructor(
    clock: ClockService,
    private readonly sweeper: BillRefundSweeperService,
  ) {
    super(clock, { name: BILL_REFUND_SWEEP_JOB, intervalMs: REFUND_SWEEP_INTERVAL_MS });
  }

  protected override run(): Promise<RefundSweepResult> {
    return this.sweeper.sweep();
  }
}
