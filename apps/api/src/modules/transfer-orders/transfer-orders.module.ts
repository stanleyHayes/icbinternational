import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { BeneficiariesModule } from '../beneficiaries/index.js';
import { IdempotencyModule } from '../idempotency/index.js';

import { TransferOrderLifecycleService } from './transfer-order-lifecycle.service.js';
import { TRANSFER_ORDER_MODEL } from './transfer-order.constants.js';
import { TransferOrderRepository } from './transfer-order.repository.js';
import { TransferOrderSchema } from './transfer-order.schema.js';
import { TransferOrderService } from './transfer-order.service.js';
import { TransferOrderStore } from './transfer-order.store.js';
import { TransferOrdersController } from './transfer-orders.controller.js';

/**
 * Standing orders: setting them up, following them, pausing, skipping and stopping.
 *
 * ## What this module is, and what it is not
 *
 * It is the customer's control over a repeating payment, and the record of what they
 * instructed. It is **not** the thing that executes one — nothing here books an entry,
 * takes a fee or touches the ledger, which is why there is no `PostingService`, no
 * `TransactionRunner` and no processor in the provider list.
 *
 * The execution lane is missing from the bank rather than from this module: the scheduler
 * that would read `TransferOrderStore.dueForRun` and move the money does not exist yet.
 * Until it does, a standing order set up here is a live, correctly dated instruction that
 * nothing acts on. `docs/HANDOFFS.md` carries that as the lane's outstanding half, and the
 * seam it will attach to — the due query, the `{status, nextRunAt}` index behind it and the
 * `occurrencesRun` / `lastRunAt` / `consecutiveFailures` fields it maintains — is defined
 * here so the two halves cannot disagree about what "due" means.
 *
 * ## Where the collaborators come from
 *
 * `AccountsModule` supplies the ownership and usability check on the paying account, and
 * `BeneficiariesModule` the one on the payee: a standing order is a standing instruction to
 * pay a saved payee, so both have to be the customer's own at the moment it is set up.
 *
 * `AuditModule` and `IdempotencyModule` are imported for their interceptors rather than for
 * a service — every mutation on the controller is audited, and the two that commit the
 * customer to money movement carry replay protection.
 *
 * `TransferOrderRepository` is provided under its own token as well as behind the store, so
 * the audit interceptor can resolve it as the module's `AuditSubjectLoader`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TRANSFER_ORDER_MODEL, schema: TransferOrderSchema }]),
    AccountsModule,
    BeneficiariesModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [TransferOrdersController],
  providers: [
    { provide: TransferOrderStore, useClass: TransferOrderRepository },
    TransferOrderRepository,
    TransferOrderService,
    TransferOrderLifecycleService,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
  ],
  exports: [TransferOrderStore, TransferOrderService, TransferOrderLifecycleService],
})
export class TransferOrdersModule {}
