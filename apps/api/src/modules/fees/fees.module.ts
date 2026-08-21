import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { ProductsModule } from '../products/index.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { ChargeableAccountReader } from './chargeable-account.reader.js';
import { ChargeableAccountSchema } from './chargeable-account.schema.js';
import { CustomerTierPort, StandardTermsTierPort } from './customer-tier.port.js';
import { FeeChargeRepository } from './fee-charge.repository.js';
import { FeeChargeSchema } from './fee-charge.schema.js';
import { FeeChargeStore } from './fee-charge.store.js';
import { FeeChargingService } from './fee-charging.service.js';
import { FeeIncomeReader } from './fee-income.reader.js';
import { FeeJournalReadSchema } from './fee-journal-read.schema.js';
import { FeePostingService } from './fee-posting.service.js';
import { FeeReconciliationService } from './fee-reconciliation.service.js';
import {
  CHARGEABLE_ACCOUNT_MODEL,
  FEE_CHARGE_MODEL,
  FEE_JOURNAL_READ_MODEL,
} from './fees.constants.js';
import { MaintenanceFeeService } from './maintenance-fee.service.js';
import { MonthlyMaintenanceTask } from './monthly-maintenance.task.js';

/**
 * The fees engine: when fees are assessed and how they land in the ledger.
 *
 * The price list is not here — products owns the schedules, the waiver rules and the
 * free-allowance counters. This module decides that a fee is due (the monthly
 * maintenance sweep, or a billable event another lane reports), prices it against the
 * account's pinned product version, and books it: debit the customer, credit GL 4000,
 * one balanced `FEE` entry, with the charge record committing in the same transaction.
 *
 * `PostingService` comes from `AccountsModule`, not `LedgerModule`: the accounts module
 * re-binds it to the Mongo-backed balance port, and the instance from `LedgerModule`
 * would write customer balances to a throwaway map.
 *
 * `CustomerTierPort` defaults to standard terms because no lane owns a customer's
 * pricing tier yet; the port is the seam where that binding lands later.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FEE_CHARGE_MODEL, schema: FeeChargeSchema },
      { name: CHARGEABLE_ACCOUNT_MODEL, schema: ChargeableAccountSchema },
      { name: FEE_JOURNAL_READ_MODEL, schema: FeeJournalReadSchema },
    ]),
    AccountsModule,
    ProductsModule,
    TransactionsModule,
  ],
  providers: [
    { provide: FeeChargeStore, useClass: FeeChargeRepository },
    { provide: CustomerTierPort, useClass: StandardTermsTierPort },
    ChargeableAccountReader,
    FeeIncomeReader,
    FeePostingService,
    FeeChargingService,
    MaintenanceFeeService,
    FeeReconciliationService,
    MonthlyMaintenanceTask,
    // Provided locally, as the other modules do, so the module stands up in a test that
    // wires only a Mongoose connection rather than the whole application root.
    TransactionRunner,
  ],
  exports: [
    FeeChargingService,
    MaintenanceFeeService,
    FeeReconciliationService,
    FeeChargeStore,
    CustomerTierPort,
  ],
})
export class FeesModule {}
