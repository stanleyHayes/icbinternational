import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigService } from '../../config/config.service.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProductsModule } from '../products/index.js';

import { AccountBalanceModule } from './account-balance.module.js';
import { AccountClosureService } from './account-closure.service.js';
import { AccountEligibilityService } from './account-eligibility.service.js';
import { AccountNumberService } from './account-number.service.js';
import { AccountOpeningService } from './account-opening.service.js';
import { AccountStatusService } from './account-status.service.js';
import { BANK_IDENTITY, type BankIdentity } from './account.constants.js';
import { AccountFactory } from './account.factory.js';
import { AccountService } from './account.service.js';
import { AccountsController } from './accounts.controller.js';
import { ExchangeRatePort, IdentityExchangeRatePort } from './exchange-rate.port.js';
import { NetWorthService } from './net-worth.service.js';

/**
 * Customer accounts, their balances and the port the ledger moves them through.
 *
 * `AccountStore` and `AccountBalancePort` are bound in `AccountBalanceModule` and
 * re-exported here, so this module keeps its public surface while the ledger can reach
 * the same single binding without importing `AccountsModule` and forming a cycle.
 *
 * `PostingService` is re-exported straight from `LedgerModule`. It used to be rebuilt here
 * by a factory, because `LedgerModule` bound the balance port to an in-memory map and a
 * caller could not override it from outside; that produced two posting services under one
 * token, resolved by import order. `AccountBalanceModule` removed the need — there is now
 * one of each.
 */
@Module({
  imports: [AccountBalanceModule, LedgerModule, ProductsModule, UsersModule, AuthModule],
  controllers: [AccountsController],
  providers: [
    { provide: ExchangeRatePort, useClass: IdentityExchangeRatePort },
    {
      provide: BANK_IDENTITY,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): BankIdentity => ({
        countryCode: config.bank.country,
        bankCode: config.bank.code,
        sortCode: config.bank.sortCode,
      }),
    },
    AccountNumberService,
    AccountFactory,
    AccountEligibilityService,
    AccountOpeningService,
    AccountService,
    AccountStatusService,
    AccountClosureService,
    NetWorthService,
    // Provided locally, as the ledger does, so the module stands up in a test that wires
    // only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    // Modules, not tokens: `AccountStore` and `AccountBalancePort` are bound in
    // `AccountBalanceModule` and `PostingService` in `LedgerModule`. Importers of this
    // module still resolve all three.
    AccountBalanceModule,
    LedgerModule,
    AccountService,
    AccountOpeningService,
    AccountStatusService,
    AccountClosureService,
    AccountNumberService,
    NetWorthService,
    ExchangeRatePort,
  ],
})
export class AccountsModule {}
