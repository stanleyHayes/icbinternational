import { Module } from '@nestjs/common';

import { RailKernelService } from './rail-kernel.service.js';

/**
 * The deterministic simulator kernel the payment rails share.
 *
 * A rail module, not a feature module: it must never reach back into `modules/`.
 * `AppConfigService` and `ClockService` are global, so there is nothing to import;
 * the rail lanes (ACH, SWIFT) import this module and build their `PaymentRailPort`
 * implementations on top of {@link RailKernelService}.
 *
 * **Scheduling boundary.** Cut-off windows and settlement batches are computed here
 * against the simulated clock. The BullMQ jobs that *fire* at those windows belong to
 * the consuming lane's module (rails may not import `modules/jobs`), enqueued on the
 * platform `rails` queue with delays computed from `nextSettlement`.
 */
@Module({
  providers: [RailKernelService],
  exports: [RailKernelService],
})
export class RailsKernelModule {}
