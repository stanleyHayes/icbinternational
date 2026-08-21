import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { PaymentRequestExpiryTask } from './payment-request-expiry.task.js';
import {
  LoggingPaymentRequestNotifier,
  PaymentRequestNotifierPort,
} from './payment-request-notifier.port.js';
import { PaymentRequestSettlementService } from './payment-request-settlement.service.js';
import { PAYMENT_REQUEST_MODEL } from './payment-request.constants.js';
import { PaymentRequestFactory } from './payment-request.factory.js';
import { PaymentRequestPoster } from './payment-request.poster.js';
import { PaymentRequestRepository } from './payment-request.repository.js';
import { PaymentRequestSchema } from './payment-request.schema.js';
import { PaymentRequestService } from './payment-request.service.js';
import { PaymentRequestStore } from './payment-request.store.js';
import { PaymentRequestsController } from './payment-requests.controller.js';
import { SplitBillService } from './split-bill.service.js';

/**
 * Peer payment requests, links, QR codes and split bills.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is taken from `AccountsModule`, not from `LedgerModule` — the ledger's
 * instance is bound to an in-memory balance port and would write customer balances to a map
 * that dies with the process. Every module that moves customer money takes the accounts
 * lane's instance; the same note applies here as to transfers, FX and bill pay.
 *
 * `BalanceService` comes from `HoldsModule`, because availability is ledger minus holds plus
 * facility and only the module that owns holds can answer it without racing the module that
 * places them.
 *
 * Notification is a port with a logging default. Whether a raised request becomes an email,
 * a push or a row in a feed belongs to the communications lane, and this module has no
 * business knowing which — see `docs/HANDOFFS.md`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: PAYMENT_REQUEST_MODEL, schema: PaymentRequestSchema }]),
    AccountsModule,
    HoldsModule,
    TransactionsModule,
    UsersModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [PaymentRequestsController],
  providers: [
    { provide: PaymentRequestStore, useClass: PaymentRequestRepository },
    { provide: PaymentRequestNotifierPort, useClass: LoggingPaymentRequestNotifier },
    PaymentRequestFactory,
    PaymentRequestService,
    PaymentRequestPoster,
    PaymentRequestSettlementService,
    SplitBillService,
    PaymentRequestExpiryTask,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    PaymentRequestStore,
    PaymentRequestService,
    PaymentRequestSettlementService,
    SplitBillService,
    PaymentRequestFactory,
  ],
})
export class PaymentRequestsModule {}
