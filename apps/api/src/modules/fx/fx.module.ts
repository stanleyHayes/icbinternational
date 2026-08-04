import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { FxAlertProcessor } from './fx-alert.processor.js';
import { FxAlertRepository } from './fx-alert.repository.js';
import { FxAlertSchema } from './fx-alert.schema.js';
import { FxAlertService } from './fx-alert.service.js';
import { FxAlertStore } from './fx-alert.store.js';
import { FxConversionPoster } from './fx-conversion.poster.js';
import { FxExchangeRateAdapter } from './fx-exchange-rate.adapter.js';
import { FxExecutionService } from './fx-execution.service.js';
import { FxQuoteRepository } from './fx-quote.repository.js';
import { FxQuoteSchema } from './fx-quote.schema.js';
import { FxQuoteService } from './fx-quote.service.js';
import { FxQuoteStore } from './fx-quote.store.js';
import { FxRateService } from './fx-rate.service.js';
import { FX_ALERT_MODEL, FX_QUOTE_MODEL } from './fx.constants.js';
import { FxController } from './fx.controller.js';
import { LoggingRateAlertNotifier, RateAlertNotifierPort } from './rate-alert-notifier.port.js';
import { RateProviderPort } from './rate-feed/rate-provider.port.js';
import { SimulatedRateProvider } from './rate-feed/simulated-rate.provider.js';

/**
 * Foreign exchange: the market, the price, the trade and the watch list.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is taken from `AccountsModule`, not from `LedgerModule`. The ledger
 * binds `AccountBalancePort` to an in-memory default, so the instance it exports writes
 * customer balances to a map that dies with the process; the accounts lane re-provides one
 * bound to the Mongo-backed port. Every module that moves customer money has to take that
 * instance — the same note applies here as to transfers.
 *
 * `BalanceService` comes from `HoldsModule`, because "can this wallet cover the sale?" is
 * ledger minus holds plus facility, and only the module that owns holds can answer it
 * without racing the module that places them.
 *
 * `RateProviderPort` is bound to the simulated feed here and nowhere else. Everything
 * downstream — pricing, the board, alerts, the net-worth adapter — depends on the port, so
 * replacing the tape with a vendor feed is this one line.
 *
 * `FxExchangeRateAdapter` is exported rather than bound over `ExchangeRatePort`: that token
 * is provided inside `AccountsModule`, and Nest resolves a provider in the module that
 * declares its consumer, so rebinding it from out here would not change what `NetWorth`
 * sees. `docs/HANDOFFS.md` carries the one-line request to the accounts lane.
 */
@Module({
  imports: [
    JobsModule,
    MongooseModule.forFeature([
      { name: FX_QUOTE_MODEL, schema: FxQuoteSchema },
      { name: FX_ALERT_MODEL, schema: FxAlertSchema },
    ]),
    AccountsModule,
    HoldsModule,
    TransactionsModule,
    UsersModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [FxController],
  providers: [
    { provide: RateProviderPort, useClass: SimulatedRateProvider },
    { provide: FxQuoteStore, useClass: FxQuoteRepository },
    { provide: FxAlertStore, useClass: FxAlertRepository },
    { provide: RateAlertNotifierPort, useClass: LoggingRateAlertNotifier },
    FxRateService,
    FxQuoteService,
    FxConversionPoster,
    FxExecutionService,
    FxAlertService,
    FxAlertProcessor,
    FxExchangeRateAdapter,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    RateProviderPort,
    FxRateService,
    FxQuoteService,
    FxExecutionService,
    FxAlertService,
    FxQuoteStore,
    FxExchangeRateAdapter,
  ],
})
export class FxModule {}
