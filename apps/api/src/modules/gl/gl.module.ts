import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { JournalEntrySchema } from '../ledger/schemas/journal-entry.schema.js';

import { GlAccountsController } from './gl-accounts.controller.js';
import { GlAccountsService } from './gl-accounts.service.js';
import { GlSeederService } from './gl-seeder.service.js';
import { GlTotalsRepository } from './gl-totals.repository.js';
import { GL_CHART_ACCOUNT_MODEL, GL_JOURNAL_READ_MODEL } from './gl.constants.js';
import { LedgerAccountRepository } from './ledger-account.repository.js';
import { GlChartAccountSchema } from './schemas/ledger-account.schema.js';
import { TrialBalanceController } from './trial-balance.controller.js';
import { TrialBalanceService } from './trial-balance.service.js';

/**
 * The chart of accounts: the seeded GL, guarded admin CRUD over it, and the
 * trial-balance report.
 *
 * Both models are registered under GL-specific names on the ledger's collections. The
 * ledger module owns the `LedgerAccount` and `JournalEntry` model names; registering
 * them here too would collide at boot when both modules load. Nothing in this module
 * writes to the journal — the read model exists so the trial balance can aggregate over
 * the system of record with the ledger's own schema.
 *
 * `GlSeederService` is exported so the foundation seed (L-01) and the CLI script can run
 * it without reaching into the module.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GL_CHART_ACCOUNT_MODEL, schema: GlChartAccountSchema },
      { name: GL_JOURNAL_READ_MODEL, schema: JournalEntrySchema },
    ]),
  ],
  controllers: [GlAccountsController, TrialBalanceController],
  providers: [
    GlAccountsService,
    TrialBalanceService,
    GlSeederService,
    LedgerAccountRepository,
    GlTotalsRepository,
    IdGenerator,
    // Provided locally for the same reason the ledger module does: `GlSeederService`
    // seeds inside a transaction, and the module must stand up in a test that wires only
    // a Mongoose connection rather than the whole global DatabaseModule.
    TransactionRunner,
  ],
  exports: [GlSeederService, GlAccountsService, TrialBalanceService],
})
export class GlModule {}
