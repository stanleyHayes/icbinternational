import { Injectable } from '@nestjs/common';

import { type CurrencyCode, type ExchangeRate } from '@reliance/money';

// The port's own file, not the accounts barrel. `AccountsModule` imports the module that
// binds this adapter, so a barrel import would be read back while the barrel is still
// loading and resolve to undefined at `extends`.
import { ExchangeRatePort } from '../accounts/exchange-rate.port.js';

import { RateProviderPort } from './rate-feed/rate-provider.port.js';

/**
 * The real rate source the accounts lane left a socket for.
 *
 * `AccountsModule` binds `ExchangeRatePort` to an identity implementation that can convert
 * a currency to itself and refuses everything else — deliberately honest, so a
 * multi-currency customer got `RATE_UNAVAILABLE` rather than an invented total. This is
 * the implementation that fills it in.
 *
 * **Mid-market, not the customer's rate.** A net-worth figure is a valuation, not a trade:
 * the customer is not selling anything, so charging them a spread to be told what they own
 * would understate their position by the bank's margin. The customer rate applies when
 * value actually changes hands, and only then.
 *
 * Binding this over the default is one line in whichever module composes them — see
 * `docs/HANDOFFS.md`.
 */
@Injectable()
export class FxExchangeRateAdapter extends ExchangeRatePort {
  constructor(private readonly rates: RateProviderPort) {
    super();
  }

  override async rateFor(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    const quote = await this.rates.midFor(from, to);
    return quote?.rate ?? null;
  }
}
