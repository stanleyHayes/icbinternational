import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { type Connection } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountBalanceModule } from '../accounts/account-balance.module.js';

import { LedgerVerifierService } from './ledger-verifier.service.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_MODEL } from './ledger.constants.js';
import { PostingService } from './posting.service.js';
import { JournalEntryRepository } from './repositories/journal-entry.repository.js';
import { JournalEntryStore } from './repositories/journal-entry.store.js';
import { LedgerAccountRepository } from './repositories/ledger-account.repository.js';
import { LedgerAccountStore } from './repositories/ledger-account.store.js';
import { ReversalService } from './reversal.service.js';
import { JournalEntrySchema } from './schemas/journal-entry.schema.js';
import { LedgerAccountSchema } from './schemas/ledger-account.schema.js';
import { applyLedgerValidators } from './schemas/ledger-validators.js';
import { LedgerRepairService } from './verification/ledger-repair.service.js';

/**
 * The ledger: system of record, balance projections and the proof they agree.
 *
 * `PostingService` and `ReversalService` are the only writers and are exported for the
 * feature modules that move money. The stores are exported as their abstract classes so
 * a consumer depends on the contract, not on Mongoose. `LedgerVerifierService` and
 * `LedgerRepairService` back `pnpm ledger:verify` and the nightly reconciliation job.
 *
 * `AccountBalancePort` comes from `AccountBalanceModule`, which binds it to the account
 * collection. This module deliberately does not bind it itself: when both this module and
 * `AccountsModule` provided the token, each exported a differently-wired `PostingService`
 * and the one a caller received depended on its import order. See `AccountBalanceModule`
 * for the full account of that failure.
 */
@Module({
  imports: [
    // Binds `AccountBalancePort` to the account collection. Imported rather than bound
    // here so exactly one implementation exists application-wide.
    AccountBalanceModule,
    MongooseModule.forFeature([
      { name: JOURNAL_ENTRY_MODEL, schema: JournalEntrySchema },
      { name: LEDGER_ACCOUNT_MODEL, schema: LedgerAccountSchema },
    ]),
  ],
  providers: [
    { provide: JournalEntryStore, useClass: JournalEntryRepository },
    { provide: LedgerAccountStore, useClass: LedgerAccountRepository },
    PostingService,
    ReversalService,
    LedgerVerifierService,
    LedgerRepairService,
    // The root module's IdGenerator is not visible here. A second instance is harmless:
    // ULID uniqueness comes from its random part; monotonicity only orders ids per instance.
    IdGenerator,
    // Provided locally rather than relied on from the global DatabaseModule, so the
    // module stands up on its own in a test that wires only a Mongoose connection.
    // TransactionRunner holds no state beyond that connection, so a second instance
    // behaves identically to the global one.
    TransactionRunner,
  ],
  exports: [
    PostingService,
    ReversalService,
    LedgerVerifierService,
    LedgerRepairService,
    JournalEntryStore,
    LedgerAccountStore,
    // Re-exported as a module: the token is bound there, not here, and Nest only
    // re-exports a provider through the module that owns it.
    AccountBalanceModule,
  ],
})
export class LedgerModule implements OnModuleInit {
  private readonly logger = new Logger(LedgerModule.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Syncs the server-side `$jsonSchema` validators on boot.
   *
   * Best-effort: a failure here must not stop the API (the write path is still guarded
   * by Mongoose and the domain), but it is an error-level event because running without
   * database-side validation is a degraded state, not a normal one.
   */
  async onModuleInit(): Promise<void> {
    try {
      await applyLedgerValidators(this.connection);
    } catch (error) {
      this.logger.error(`Ledger $jsonSchema validator sync failed: ${(error as Error).message}`);
    }
  }
}
