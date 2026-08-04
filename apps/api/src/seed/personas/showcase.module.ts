import { Module } from '@nestjs/common';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigModule } from '../../config/config.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AccountsModule } from '../../modules/accounts/accounts.module.js';
import { AuthModule } from '../../modules/auth/auth.module.js';
import { GlModule } from '../../modules/gl/gl.module.js';
import { LedgerModule } from '../../modules/ledger/ledger.module.js';
import { TransactionsModule } from '../../modules/transactions/transactions.module.js';
import { SeedModule } from '../seed.module.js';

import { CustomerFactoryService } from './customer-factory.service.js';
import { PersonaBuilderService } from './persona-builder.service.js';
import { ShowcaseService } from './showcase.service.js';

/**
 * The showcase generator's own context.
 *
 * It imports the real accounts, ledger and auth modules rather than reaching into the
 * database, because the point of the generated history is that it went through the same
 * code a live request does. It does not import `AppModule`: an HTTP server and a scheduler
 * running against a half-built dataset is the situation this command exists to avoid.
 */
@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    DatabaseModule,
    SeedModule,
    AuthModule,
    GlModule,
    LedgerModule,
    AccountsModule,
    // The generated history has to reach the activity feed, not only the ledger.
    TransactionsModule,
  ],
  providers: [IdGenerator, CustomerFactoryService, PersonaBuilderService, ShowcaseService],
  exports: [ShowcaseService],
})
export class ShowcaseModule {}
