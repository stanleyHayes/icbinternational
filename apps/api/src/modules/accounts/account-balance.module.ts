import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AccountBalancePort } from '../ledger/ports/account-balance.port.js';
import { AccountOwnerPort } from '../transactions/ports/account-owner.port.js';

import { ACCOUNT_MODEL } from './account.constants.js';
import { AccountRepository } from './account.repository.js';
import { AccountSchema } from './account.schema.js';
import { AccountStore } from './account.store.js';
import { MongoAccountBalancePort } from './mongo-account-balance.port.js';
import { MongoAccountOwnerPort } from './mongo-account-owner.port.js';

/**
 * The one place `AccountBalancePort` is bound to a real database.
 *
 * ## Why this module exists
 *
 * `AccountBalancePort` is declared by the ledger and implemented against the account
 * collection, so neither module can own the binding alone: the ledger must not know the
 * account schema, and the accounts module cannot reach inside `LedgerModule` to change
 * what its `PostingService` was constructed with.
 *
 * The previous arrangement gave each of them their own answer. `LedgerModule` bound the
 * port to an in-memory map and exported a `PostingService` built on it; `AccountsModule`
 * bound it to Mongo and exported a *second* `PostingService`. Both were exported under the
 * same token, and Nest resolves a token from the first module in an importer's `imports`
 * array that provides it — so which posting service a module received depended on the
 * order two lines happened to be written in. `ShowcaseModule` listed `LedgerModule` first
 * and every balance it wrote went to a map that died with the process; `deposits`, `loans`
 * and `overdraft` listed `AccountsModule` first and were correct by luck. Sorting an
 * imports array — something a tidy-up does without thinking — was enough to disconnect
 * money movement from balances, silently, with the journal still balancing.
 *
 * Splitting the binding into its own module removes the choice. There is one
 * `AccountBalancePort`, one `PostingService`, and no import order that changes either.
 *
 * It depends on the account *schema*, not on `AccountsModule`, which is what keeps
 * `LedgerModule` able to import it without a cycle.
 *
 * The same module binds `AccountOwnerPort`, which the transactions projection uses to
 * attribute a row to a customer. It is the same shape of problem and the same answer: the
 * port is declared by the module that needs the answer, and bound by the one that has it.
 *
 * `InMemoryAccountBalancePort` and `InMemoryAccountOwnerPort` remain, but only where they
 * belong: in tests that stand a module up without a database.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: ACCOUNT_MODEL, schema: AccountSchema }])],
  providers: [
    { provide: AccountStore, useClass: AccountRepository },
    { provide: AccountBalancePort, useClass: MongoAccountBalancePort },
    { provide: AccountOwnerPort, useClass: MongoAccountOwnerPort },
  ],
  exports: [AccountStore, AccountBalancePort, AccountOwnerPort, MongooseModule],
})
export class AccountBalanceModule {}
