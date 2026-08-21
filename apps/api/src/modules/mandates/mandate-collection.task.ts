import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { BaseScheduledTask } from '../jobs/index.js';

import { MandateCollectionService } from './mandate-collection.service.js';
import { MANDATE_COLLECTION_JOB, MANDATE_SWEEP_INTERVAL_MS } from './mandate.constants.js';

/** What one collection pass attempted and took. */
export interface CollectionSweepResult {
  readonly attempted: number;
  readonly collected: number;
}

/**
 * The scheduled collection of direct-debit mandates that have fallen due.
 *
 * Was a BullMQ repeatable job on the Redis-backed scheduler queue. Collection is idempotent
 * against the mandate's own claim state, so an overlapping or repeated pass cannot double-
 * collect — the property that makes an in-process interval sufficient.
 */
@Injectable()
export class MandateCollectionTask extends BaseScheduledTask<CollectionSweepResult> {
  constructor(
    clock: ClockService,
    private readonly collections: MandateCollectionService,
  ) {
    super(clock, { name: MANDATE_COLLECTION_JOB, intervalMs: MANDATE_SWEEP_INTERVAL_MS });
  }

  protected override run(): Promise<CollectionSweepResult> {
    return this.collections.collectDue();
  }
}
