import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AccountSchema, AccountsModule } from '../accounts/index.js';
import { JobsModule } from '../jobs/index.js';
import { ProductsModule } from '../products/index.js';

import { AccrualStateRepository } from './accrual-state.repository.js';
import { AccrualStateSchema } from './accrual-state.schema.js';
import { AccrualStateStore } from './accrual-state.store.js';
import { InterestAccountSource } from './interest-account.source.js';
import { InterestAccrualProcessor } from './interest-accrual.processor.js';
import { InterestAccrualService } from './interest-accrual.service.js';
import { InterestCapitalisationProcessor } from './interest-capitalisation.processor.js';
import { InterestCapitalisationService } from './interest-capitalisation.service.js';
import { InterestTermsSource, ProductInterestTermsSource } from './interest-terms.source.js';
import { ACCRUAL_STATE_MODEL, INTEREST_ACCOUNT_VIEW_MODEL } from './interest.constants.js';
import { MongoInterestAccountSource } from './mongo-interest-account.source.js';

/**
 * The interest engine: daily accrual of tiered credit interest onto exact per-account
 * accumulators, and the monthly capitalisation that turns a month of accrual into
 * posted, balanced journal entries.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is taken from `AccountsModule`, not from `LedgerModule` — the ledger's
 * instance writes customer balances to an in-memory port that dies with the process.
 * Every module that moves customer money takes the accounts lane's instance.
 *
 * The accounts collection is registered read-only under a view-model name: the accounts
 * lane owns every write, and this module only enumerates the interest-bearing book.
 *
 * The two processors consume the platform `scheduler` queue; the simulation control room
 * (or a cron in operations) enqueues `interest.daily-accrual` daily and
 * `interest.monthly-capitalisation` on the first of the month, capitalisation first.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ACCRUAL_STATE_MODEL, schema: AccrualStateSchema },
      { name: INTEREST_ACCOUNT_VIEW_MODEL, schema: AccountSchema },
    ]),
    AccountsModule,
    ProductsModule,
    JobsModule,
  ],
  providers: [
    { provide: AccrualStateStore, useClass: AccrualStateRepository },
    { provide: InterestAccountSource, useClass: MongoInterestAccountSource },
    { provide: InterestTermsSource, useClass: ProductInterestTermsSource },
    InterestAccrualService,
    InterestCapitalisationService,
    InterestAccrualProcessor,
    InterestCapitalisationProcessor,
  ],
  exports: [
    AccrualStateStore,
    InterestAccountSource,
    InterestTermsSource,
    InterestAccrualService,
    InterestCapitalisationService,
  ],
})
export class InterestModule {}
