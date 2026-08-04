/**
 * Overdrafts: the facility, its price, and the sweep that clears it.
 *
 * Depends on the lending module for the scorecard — an overdraft is credit, and pricing it
 * off a second, subtly different score would mean the bank held two opinions about the
 * same customer. It depends on the accounts module for `AccountStore`, because writing the
 * limit onto the account is what makes the facility spendable, and there is exactly one
 * field in the system that does that.
 *
 * `AuditModule` and `IdempotencyModule` register their interceptors globally. Importing
 * them is what makes `@Audited()` and `@Idempotent()` on the controller do anything at all,
 * rather than being decoration on a route that quietly grants a second facility.
 */

import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { LoansModule } from '../loans/index.js';

import { InMemoryOverdraftStore } from './in-memory-overdraft.store.js';
import { OverdraftAssessment } from './overdraft-assessment.service.js';
import { OverdraftInterestService } from './overdraft-interest.service.js';
import { OverdraftController } from './overdraft.controller.js';
import { OverdraftService } from './overdraft.service.js';
import { OverdraftStore } from './overdraft.store.js';

@Module({
  imports: [AuthModule, AccountsModule, LedgerModule, LoansModule, AuditModule, IdempotencyModule],
  controllers: [OverdraftController],
  providers: [
    IdGenerator,
    // Provided locally, as the accounts and transfers lanes do, so the module stands up in
    // a test that wires only a Mongoose connection rather than the whole application root.
    TransactionRunner,
    { provide: OverdraftStore, useClass: InMemoryOverdraftStore },
    OverdraftAssessment,
    OverdraftService,
    OverdraftInterestService,
  ],
  exports: [OverdraftStore, OverdraftService, OverdraftInterestService],
})
export class OverdraftModule {}
