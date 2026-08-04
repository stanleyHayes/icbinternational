/**
 * Lending: products, applications, servicing, arrears and collections.
 *
 * Controller order is load-bearing. Nest matches routes in the order controllers are
 * registered, so the specific paths (`/loans/products`, `/loans/applications`) are
 * declared before `/loans/:id`, which would otherwise swallow them and answer "no such
 * loan" to a request for the catalogue.
 *
 * Persistence is bound to the in-memory stores, as the ledger module's `AccountBalancePort`
 * is. Both abstractions are complete and both fakes enforce the rules that matter — the
 * arrears sweep's per-date idempotency, the offer-state guard on expiry — so the Mongo
 * repositories can be dropped in behind them without a single service changing. The
 * handoff for that work is recorded in `docs/HANDOFFS.md`.
 */

import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { AdminArrearsController } from './admin-arrears.controller.js';
import { AdminLoansController } from './admin-loans.controller.js';
import { CreditProfileService } from './credit-profile.service.js';
import { InMemoryLoanApplicationStore } from './in-memory-loan-application.store.js';
import { InMemoryLoanStore } from './in-memory-loan.store.js';
import { LoanApplicationService } from './loan-application.service.js';
import { LoanApplicationStore } from './loan-application.store.js';
import { LoanApplicationsController } from './loan-applications.controller.js';
import { LoanArrearsService } from './loan-arrears.service.js';
import { LoanCollectionsService } from './loan-collections.service.js';
import { LoanDecisionService } from './loan-decision.service.js';
import { LoanDisbursementService } from './loan-disbursement.service.js';
import { LoanLedgerService } from './loan-ledger.service.js';
import { LoanProductsController } from './loan-products.controller.js';
import { LoanQuoteService } from './loan-quote.service.js';
import { LoanRepaymentService } from './loan-repayment.service.js';
import { LoanServicingService } from './loan-servicing.service.js';
import { LoanSettlementService } from './loan-settlement.service.js';
import { LoanStore } from './loan.store.js';
import { LoansController } from './loans.controller.js';

@Module({
  imports: [RbacModule, AuthModule, AccountsModule, LedgerModule, UsersModule],
  controllers: [
    LoanProductsController,
    LoanApplicationsController,
    LoansController,
    AdminLoansController,
    AdminArrearsController,
  ],
  providers: [
    IdGenerator,
    TransactionRunner,
    { provide: LoanStore, useClass: InMemoryLoanStore },
    { provide: LoanApplicationStore, useClass: InMemoryLoanApplicationStore },
    LoanLedgerService,
    CreditProfileService,
    LoanQuoteService,
    LoanDecisionService,
    LoanApplicationService,
    LoanDisbursementService,
    LoanServicingService,
    LoanRepaymentService,
    LoanSettlementService,
    LoanArrearsService,
    LoanCollectionsService,
  ],
  exports: [
    LoanStore,
    // Overdraft assesses affordability with the same credit profile a loan does — an
    // arranged overdraft is lending, and scoring it differently would let a customer be
    // refused a £500 loan and granted a £500 facility in the same afternoon.
    CreditProfileService,
    LoanQuoteService,
    LoanServicingService,
    LoanRepaymentService,
    LoanArrearsService,
    LoanApplicationService,
  ],
})
export class LoansModule {}
