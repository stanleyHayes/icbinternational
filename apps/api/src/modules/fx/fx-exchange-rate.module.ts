import { Module } from '@nestjs/common';

import { ExchangeRatePort } from '../accounts/exchange-rate.port.js';

import { FxExchangeRateAdapter } from './fx-exchange-rate.adapter.js';
import { RateProviderPort } from './rate-feed/rate-provider.port.js';
import { SimulatedRateProvider } from './rate-feed/simulated-rate.provider.js';

/**
 * The one place `ExchangeRatePort` is bound to a live rate source.
 *
 * ## Why this is not done inside `FxModule`
 *
 * `ExchangeRatePort` is declared by the accounts lane and implemented from the rate feed, so
 * neither module can own the binding alone — the same shape of problem `AccountBalanceModule`
 * solves for `AccountBalancePort`, and the same answer. `NetWorthService` is constructed
 * inside `AccountsModule`, and Nest resolves a provider in the module that declares its
 * consumer, so rebinding the token from `FxModule` would leave net worth still holding the
 * identity port. `AccountsModule` therefore has to import the binding, and it cannot import
 * `FxModule` to get it: `FxModule` already imports `AccountsModule` for `PostingService`, and
 * the pair would deadlock at load.
 *
 * This module depends only on the rate feed, which depends on nothing in the accounts lane,
 * so it can be imported from either side without forming a cycle.
 *
 * ## Why the feed is bound again here
 *
 * `FxModule` binds `RateProviderPort` to the same class, so a process that loads both holds
 * two instances. They cannot disagree: the tape is a pure function of the configured seed and
 * the instant, and each instance's per-session cache is an optimisation over that function
 * rather than state of its own. Folding the two into one binding means `FxModule` importing
 * this module instead of binding the port itself — worth doing, but it belongs to whoever
 * owns `fx.module.ts`.
 */
@Module({
  providers: [
    { provide: RateProviderPort, useClass: SimulatedRateProvider },
    { provide: ExchangeRatePort, useClass: FxExchangeRateAdapter },
  ],
  exports: [ExchangeRatePort, RateProviderPort],
})
export class FxExchangeRateModule {}
