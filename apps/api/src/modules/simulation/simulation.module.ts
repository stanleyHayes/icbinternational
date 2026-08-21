import { Module } from '@nestjs/common';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { FxModule } from '../fx/fx.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { SimulationController } from './simulation.controller.js';
import { SimulationService } from './simulation.service.js';
import { SnapshotStore } from './snapshot.store.js';

/**
 * The operations console's control room.
 *
 * Imports `AccountsModule` (and through it `LedgerModule`) for the mint operation,
 * `FxModule` for the rate-move command and `RbacModule`
 * for the `@AdminEndpoint()` guard chain.
 *
 * `SnapshotStore` is process-local state: an in-memory map that lives for the lifetime
 * of the API process. That is intentional for a development tool — cross-process snapshot
 * consistency would require a persistent store and a distributed clock, neither of which
 * advances the simulation's goal of a deterministic, demonstrable scenario.
 */
@Module({
  imports: [ClockModule, AccountsModule, FxModule, RbacModule],
  controllers: [SimulationController],
  providers: [SimulationService, SnapshotStore, IdGenerator],
})
export class SimulationModule {}
