/**
 * Term deposits: the rate board, placement, maturity, rollover and early break.
 *
 * Depends on the lending module only for its calendar arithmetic — a maturity date is the
 * same month-end-safe calculation as an instalment date, and having two implementations of
 * that is how a February deposit matures on the wrong day.
 *
 * `HoldsModule` supplies `BalanceService`, which is how a placement asks "can this account
 * cover it" before it posts. Availability is ledger minus holds plus facility and only the
 * module that owns holds can answer it; a second opinion computed here would be the second
 * definition of spendable money in the bank.
 *
 * `AuditModule` and `IdempotencyModule` register their interceptors globally. Importing
 * them is what makes `@Audited()` and `@Idempotent()` on the controller do anything at
 * all, rather than being decoration on a route that quietly double-books.
 */

import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';

import { DepositMaturityService } from './deposit-maturity.service.js';
import { DepositService } from './deposit.service.js';
import { DepositStore } from './deposit.store.js';
import { DepositsController } from './deposits.controller.js';
import { InMemoryDepositStore } from './in-memory-deposit.store.js';

@Module({
  imports: [AuthModule, AccountsModule, HoldsModule, LedgerModule, AuditModule, IdempotencyModule],
  controllers: [DepositsController],
  providers: [
    IdGenerator,
    // Provided locally, as the accounts and transfers lanes do, so the module stands up in
    // a test that wires only a Mongoose connection rather than the whole application root.
    TransactionRunner,
    { provide: DepositStore, useClass: InMemoryDepositStore },
    DepositService,
    DepositMaturityService,
  ],
  exports: [DepositStore, DepositService, DepositMaturityService],
})
export class DepositsModule {}
