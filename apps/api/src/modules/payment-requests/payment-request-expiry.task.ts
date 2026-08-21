import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask } from '../jobs/index.js';

import { REQUEST_EXPIRY_INTERVAL_MS, REQUEST_EXPIRY_JOB } from './payment-request.constants.js';
import { PaymentRequestService } from './payment-request.service.js';

/** How many requests one pass closed. */
export interface ExpirySweepResult {
  readonly expired: number;
}

/**
 * The scheduled expiry of payment requests nobody answered.
 *
 * Was a BullMQ repeatable job on the Redis-backed scheduler queue. Which requests are overdue
 * is decided on the bank's clock inside the service, not by the tick — so a simulated jump
 * forward closes the right set on the next pass.
 */
@Injectable()
export class PaymentRequestExpiryTask extends BaseScheduledTask<ExpirySweepResult> {
  constructor(
    clock: ClockService,
    private readonly requests: PaymentRequestService,
  ) {
    super(clock, { name: REQUEST_EXPIRY_JOB, intervalMs: REQUEST_EXPIRY_INTERVAL_MS });
  }

  protected override async run(): Promise<ExpirySweepResult> {
    return { expired: await this.requests.expireLapsed() };
  }
}
