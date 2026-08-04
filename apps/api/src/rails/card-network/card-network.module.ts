import { Module } from '@nestjs/common';

import { AppConfigModule } from '../../config/config.module.js';

import { CardNetworkSimulator } from './card-network.simulator.js';

/**
 * The card scheme the bank authorises against.
 *
 * A rail, not a feature module: it implements the outside world and must never reach back
 * into `modules/`. The cards lane imports it; nothing here imports the cards lane, which
 * is what keeps the authorisation path testable with the rail swapped for a stub.
 */
@Module({
  imports: [AppConfigModule],
  providers: [CardNetworkSimulator],
  exports: [CardNetworkSimulator],
})
export class CardNetworkModule {}
