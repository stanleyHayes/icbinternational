/**
 * The FX module's public surface.
 *
 * Other lanes import from here, never from a file inside. Wallets needs the quote and
 * execution services; the accounts lane needs the rate adapter; the simulation lane needs
 * the provider port to move the market. None of them has any business knowing how a quote
 * document is shaped.
 */

export { FxModule } from './fx.module.js';

export { FxRateService, rateUnavailable } from './fx-rate.service.js';
export { FxQuoteService } from './fx-quote.service.js';
export {
  FxExecutionService,
  assertLive,
  quoteExpired,
  quoteNotFound,
} from './fx-execution.service.js';
export { FxConversionPoster, type BookedConversion } from './fx-conversion.poster.js';
export { FxAlertService, hasCrossed, toContractAlert } from './fx-alert.service.js';
export { FxAlertProcessor, type AlertSweepResult } from './fx-alert.processor.js';
export { FxExchangeRateAdapter } from './fx-exchange-rate.adapter.js';
export {
  LoggingRateAlertNotifier,
  RateAlertNotifierPort,
  type RateAlertNotice,
} from './rate-alert-notifier.port.js';

export { RateProviderPort, type MidQuote } from './rate-feed/rate-provider.port.js';
export { SimulatedRateProvider } from './rate-feed/simulated-rate.provider.js';
export {
  anchorFor,
  isQuotable,
  PIVOT_CURRENCY,
  QUOTABLE_CURRENCIES,
} from './rate-feed/base-rates.js';
export {
  advance,
  changeBps,
  nextRandom,
  seedFor,
  step,
  WALK_LIMITS,
  type WalkState,
} from './rate-feed/random-walk.js';

export {
  halfOf,
  markDown,
  markUp,
  pairSpreadBps,
  spreadBpsFor,
  type CustomerTier,
} from './fx-spread.js';
export { priceByBuy, priceBySell, type FxPrice } from './fx-pricing.js';

export {
  FxQuoteStore,
  type ConsumeFxQuoteInput,
  type FxQuoteRecord,
  type NewFxQuote,
} from './fx-quote.store.js';
export { FxQuoteRepository } from './fx-quote.repository.js';
export { InMemoryFxQuoteStore } from './in-memory-fx-quote.store.js';

export {
  FxAlertStore,
  type AlertDirection,
  type FxAlertRecord,
  type NewFxAlert,
} from './fx-alert.store.js';
export { FxAlertRepository } from './fx-alert.repository.js';
export { InMemoryFxAlertStore } from './in-memory-fx-alert.store.js';

export {
  rateToString,
  toContractConversion,
  toContractQuote,
  toContractRate,
} from './fx.mapper.js';

export {
  FX_ALERT_BATCH,
  FX_ALERT_COLLECTION,
  FX_ALERT_INTERVAL_MS,
  FX_ALERT_JOB,
  FX_ALERT_MODEL,
  FX_CONVERSION_DESCRIPTION,
  FX_CONVERSION_REFERENCE_PREFIX,
  FX_QUOTE_COLLECTION,
  FX_QUOTE_MODEL,
  FX_QUOTE_RETENTION_DAYS,
  FX_QUOTE_TTL_SECONDS,
} from './fx.constants.js';
export { FxQuoteSchema, FxQuoteSchemaClass, type FxQuoteDocument } from './fx-quote.schema.js';
export { FxAlertSchema, FxAlertSchemaClass, type FxAlertDocument } from './fx-alert.schema.js';
