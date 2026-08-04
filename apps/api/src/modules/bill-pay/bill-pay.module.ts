import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { BillerRailPort, SimulatedBillerRail } from '../../rails/biller/index.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { BILLER_MODEL, BILL_PAYMENT_MODEL } from './bill-pay.constants.js';
import { BillPayController } from './bill-pay.controller.js';
import { BillPayService } from './bill-pay.service.js';
import { BillPaymentBookingService } from './bill-payment-booking.service.js';
import { BillPaymentQueryService } from './bill-payment-query.service.js';
import { BillPaymentPoster } from './bill-payment.poster.js';
import { BillPaymentProcessor } from './bill-payment.processor.js';
import { BillPaymentRepository } from './bill-payment.repository.js';
import { BillPaymentSchema } from './bill-payment.schema.js';
import { BillPaymentStore } from './bill-payment.store.js';
import { BillRefundSweepProcessor } from './bill-refund-sweep.processor.js';
import { BillRefundSweeperService } from './bill-refund-sweeper.service.js';
import { BillRefundService } from './bill-refund.service.js';
import { BillSubmissionQueue } from './bill-submission.queue.js';
import { BillSubmissionService } from './bill-submission.service.js';
import { BillerDirectoryRepository } from './biller-directory.repository.js';
import { BillerDirectoryService } from './biller-directory.service.js';
import { BillerDirectoryStore } from './biller-directory.store.js';
import { BillerSchema } from './biller.schema.js';
import { TopUpService } from './top-up.service.js';

/**
 * Bill payment and mobile top-ups.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is taken from `AccountsModule`, not from `LedgerModule` — the ledger's
 * instance is bound to an in-memory balance port and would write customer balances to a map
 * that dies with the process. Every module that moves customer money takes the accounts
 * lane's instance; the same note applies here as to transfers and FX.
 *
 * `BalanceService` comes from `HoldsModule`, because availability is ledger minus holds plus
 * facility and only the module that owns holds can answer it without racing the module that
 * places them.
 *
 * `BillerRailPort` is bound to the simulator here and nowhere else. The rail lives under
 * `src/rails` and is forbidden by the layering rules from reaching back into any feature
 * module, which is what keeps "what the network does" independent of "what the bank does
 * about it".
 *
 * The biller directory model is registered read-only: `BillersSeeder` owns those documents
 * and this lane never writes them.
 */
@Module({
  imports: [
    JobsModule,
    MongooseModule.forFeature([
      { name: BILL_PAYMENT_MODEL, schema: BillPaymentSchema },
      { name: BILLER_MODEL, schema: BillerSchema },
    ]),
    AccountsModule,
    HoldsModule,
    TransactionsModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [BillPayController],
  providers: [
    { provide: BillPaymentStore, useClass: BillPaymentRepository },
    { provide: BillerDirectoryStore, useClass: BillerDirectoryRepository },
    { provide: BillerRailPort, useClass: SimulatedBillerRail },
    BillerDirectoryService,
    BillPaymentPoster,
    BillPaymentBookingService,
    BillPaymentQueryService,
    BillSubmissionQueue,
    BillRefundService,
    BillSubmissionService,
    BillPaymentProcessor,
    BillRefundSweeperService,
    BillRefundSweepProcessor,
    BillPayService,
    TopUpService,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    BillPaymentStore,
    BillerDirectoryStore,
    BillerRailPort,
    BillPayService,
    TopUpService,
    BillSubmissionService,
    BillRefundService,
    BillRefundSweeperService,
    BillPaymentQueryService,
    BillPaymentPoster,
  ],
})
export class BillPayModule {}
