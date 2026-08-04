import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountBalanceModule } from '../accounts/account-balance.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { AdminTransactionsController } from './admin-transactions.controller.js';
import { CategorisationService } from './categorisation.service.js';
import { TransactionRepository } from './repositories/transaction.repository.js';
import { TransactionStore } from './repositories/transaction.store.js';
import { TransactionSchema } from './schemas/transaction.schema.js';
import { TransactionExportService } from './transaction-export.service.js';
import { TransactionProjectorService } from './transaction-projector.service.js';
import { TransactionRangeReader } from './transaction-range.reader.js';
import { TransactionService } from './transaction.service.js';
import { TRANSACTION_MODEL } from './transactions.constants.js';
import { TransactionsController } from './transactions.controller.js';

/**
 * The customer-facing view of money movement.
 *
 * `LedgerModule` is imported for `AccountBalancePort`, which is how the projector learns
 * the balance an account was left at. The dependency runs one way only — the ledger knows
 * nothing about transactions, and must not, because the journal has to be correct whether
 * or not anything is projecting it.
 *
 * `TransactionProjectorService` and `TransactionStore` are exported for the modules that
 * move money: they call `PostingService.post`, then `project` the returned entry inside
 * the same session, so the row and the money commit together.
 *
 * `AccountOwnerPort` comes from `AccountBalanceModule`, which binds it to the accounts
 * collection. It used to default to the in-memory adapter here, and the default held long
 * enough to matter: the stub's map is empty in any process that did not register an
 * account by hand, so every projection was skipped and every customer's activity feed was
 * blank while the ledger behind it was perfect. The skip-and-log behaviour is still right —
 * a booked entry must never be aborted over a missing view — but it is a last resort, not
 * a default.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TRANSACTION_MODEL, schema: TransactionSchema }]),
    // Binds `AccountOwnerPort` — and, through the ledger, `AccountBalancePort`.
    AccountBalanceModule,
    LedgerModule,
    AuthModule,
    RbacModule,
  ],
  controllers: [AdminTransactionsController, TransactionsController],
  providers: [
    { provide: TransactionStore, useClass: TransactionRepository },
    CategorisationService,
    TransactionProjectorService,
    TransactionService,
    TransactionExportService,
    TransactionRangeReader,
    // Provided locally rather than relied on from the root module, so this module stands
    // up on its own in a test that wires only a Mongoose connection. `IdGenerator` holds
    // no state a second instance would corrupt: ULID uniqueness comes from its random
    // part, and monotonicity only orders ids minted by the same instance.
    IdGenerator,
  ],
  exports: [
    TransactionProjectorService,
    TransactionService,
    TransactionStore,
    TransactionRangeReader,
    CategorisationService,
    // The module, not the token: `AccountOwnerPort` is bound there, and Nest re-exports a
    // provider only through the module that owns it.
    AccountBalanceModule,
  ],
})
export class TransactionsModule {}
