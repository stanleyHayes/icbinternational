import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { BudgetIdGenerator } from './budget-id.js';
import { BudgetService } from './budget.service.js';
import { CashflowService } from './cashflow.service.js';
import { BUDGET_MODEL } from './insights.constants.js';
import { InsightsController } from './insights.controller.js';
import { BudgetRepository } from './repositories/budget.repository.js';
import { BudgetStore } from './repositories/budget.store.js';
import { BudgetSchema } from './schemas/budget.schema.js';
import { SpendService } from './spend.service.js';
import { SubscriptionService } from './subscription.service.js';

/**
 * What a customer's own money says about them.
 *
 * Every number on these screens is computed from the transaction list rather than from a
 * separate aggregate, which is why `TransactionsModule` is imported for
 * `TransactionRangeReader` and `TransactionStore`. Maintaining a parallel set of
 * pre-aggregated totals would be faster and would drift: the first posting that missed
 * the aggregator would leave a spend screen that disagrees with the statement beside it,
 * and no customer would ever believe either number again.
 *
 * Budgets are the module's only write, and they are a note to self — nothing here can
 * move money or change a transaction.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: BUDGET_MODEL, schema: BudgetSchema }]),
    TransactionsModule,
    AuthModule,
  ],
  controllers: [InsightsController],
  providers: [
    { provide: BudgetStore, useClass: BudgetRepository },
    BudgetIdGenerator,
    SpendService,
    CashflowService,
    SubscriptionService,
    BudgetService,
  ],
  exports: [SpendService, CashflowService, SubscriptionService, BudgetService, BudgetStore],
})
export class InsightsModule {}
