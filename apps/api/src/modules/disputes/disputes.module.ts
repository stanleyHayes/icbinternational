import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { NotificationsModule } from '../notifications/index.js';
import { RbacModule } from '../rbac/index.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { AdminDisputesController } from './admin-disputes.controller.js';
import { DisputeEvidenceService } from './dispute-evidence.service.js';
import { DisputeProgressionService } from './dispute-progression.service.js';
import { DisputeQueryService } from './dispute-query.service.js';
import { DisputeRaiseService } from './dispute-raise.service.js';
import { DisputeResolutionService } from './dispute-resolution.service.js';
import { DisputePoster } from './dispute.poster.js';
import { DisputeRepository } from './dispute.repository.js';
import { DisputeSchema } from './dispute.schema.js';
import { DisputeStore } from './dispute.store.js';
import { DISPUTE_MODEL } from './disputes.constants.js';
import { DisputesController } from './disputes.controller.js';
import { DisputeNotifier } from './ports/dispute-notifier.port.js';
import { MerchantResponsePort } from './ports/merchant-response.port.js';
import { NotificationBusDisputeNotifier } from './ports/notification-bus-dispute-notifier.js';
import { SimulatedMerchantResponse } from './ports/simulated-merchant-response.js';

/**
 * Card disputes: chargebacks, evidence, provisional credit and outcomes.
 *
 * ## Where the collaborators come from, and why
 *
 * `LedgerModule` supplies `PostingService` and `ReversalService`. It is the right source
 * for both since `AccountBalanceModule` took ownership of the balance port — there is one
 * posting service application-wide now, and no import order that changes which one a
 * module receives. Taking the reversal service from anywhere else is not an option: it is
 * the only thing that can undo a provisional credit without editing history.
 *
 * `TransactionsModule` supplies `TransactionStore` — a dispute is raised *against* a
 * movement, so the window, the amount, the owner and the merchant's name are all read from
 * the row rather than copied onto the case — and the projector, called inside each posting
 * session so the statement line and the money commit together.
 *
 * `NotificationsModule` backs the notifier port. The templates already exist and already
 * promise the customer their money back while the case runs; this module is what makes
 * that promise true.
 *
 * `RbacModule` is imported for the guard chain behind `@AdminEndpoint`, and `AuthModule`
 * for the customer guards. Importing them is what makes those routes genuinely protected
 * rather than merely decorated.
 *
 * `DisputeRepository` is registered under its own class as well as under `DisputeStore`:
 * the audit interceptor resolves the loader by class from the container, and `useExisting`
 * keeps both tokens pointing at one instance rather than at two connections to the same
 * collection.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: DISPUTE_MODEL, schema: DisputeSchema }]),
    LedgerModule,
    TransactionsModule,
    NotificationsModule,
    AuthModule,
    RbacModule,
    IdempotencyModule,
    AuditModule,
  ],
  controllers: [DisputesController, AdminDisputesController],
  providers: [
    DisputeRepository,
    { provide: DisputeStore, useExisting: DisputeRepository },
    { provide: DisputeNotifier, useClass: NotificationBusDisputeNotifier },
    { provide: MerchantResponsePort, useClass: SimulatedMerchantResponse },

    DisputePoster,
    DisputeQueryService,
    DisputeRaiseService,
    DisputeEvidenceService,
    DisputeResolutionService,
    DisputeProgressionService,

    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [DisputeStore, DisputeQueryService, DisputeRaiseService, DisputeResolutionService],
})
export class DisputesModule {}
