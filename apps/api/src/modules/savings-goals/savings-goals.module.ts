/**
 * Savings goals: vaults, round-ups, auto-saves and progress projection.
 *
 * Depends on the lending module only for its calendar arithmetic, which is what an
 * auto-save schedule and a target-date projection are both built on. Exports
 * `GoalAutomationService` because round-ups are triggered by card spend settling, which
 * belongs to another lane entirely — a savings goal has no way of knowing a coffee was
 * bought, and should not.
 *
 * `HoldsModule` supplies `BalanceService`, which is how the vault asks "can the linked
 * account cover this contribution" before it books one. Availability is not a property of
 * an account document — it is ledger minus holds plus facility — so only the module that
 * owns holds can answer it without racing the module that places them.
 *
 * `PostingService` comes from `AccountsModule`, **not** from `LedgerModule`, and that
 * distinction decides whether a savings vault is real money. The ledger binds
 * `AccountBalancePort` to an in-memory default, so the `PostingService` it exports writes
 * customer balances — and enforces the ledger's overdraw floor — against a map that dies
 * with the process. The accounts lane re-provides one bound to the Mongo port. Importing
 * `LedgerModule` here as well would leave which of the two Nest hands us decided by
 * declaration order, so it is not imported at all.
 *
 * `GoalStore` is the Mongo repository rather than the in-memory one. That is not a
 * preference: a vault balance is a real liability of the bank, and the conditional write
 * that keeps it agreeing with the ledger under concurrent movements is enforced by the
 * database. The in-memory store implements the same condition and stays exported for
 * tests that do not need a replica set.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { HoldsModule } from '../holds/index.js';

import { GoalAutomationService } from './goal-automation.service.js';
import { GoalVaultService } from './goal-vault.service.js';
import { GOAL_MODEL } from './goal.constants.js';
import { GoalRepository } from './goal.repository.js';
import { GoalSchema } from './goal.schema.js';
import { GoalService } from './goal.service.js';
import { GoalStore } from './goal.store.js';
import { SavingsGoalsController } from './savings-goals.controller.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: GOAL_MODEL, schema: GoalSchema }]),
    AccountsModule,
    HoldsModule,
  ],
  controllers: [SavingsGoalsController],
  providers: [
    IdGenerator,
    // Provided locally, as the transfers and holds lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    TransactionRunner,
    { provide: GoalStore, useClass: GoalRepository },
    GoalVaultService,
    GoalService,
    GoalAutomationService,
  ],
  exports: [GoalStore, GoalService, GoalVaultService, GoalAutomationService],
})
export class SavingsGoalsModule {}
