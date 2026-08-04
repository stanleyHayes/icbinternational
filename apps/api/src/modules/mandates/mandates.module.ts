import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { MandateCollectionProcessor } from './mandate-collection.processor.js';
import { MandateCollectionService } from './mandate-collection.service.js';
import { MandateDisputeService } from './mandate-dispute.service.js';
import { MANDATE_MODEL } from './mandate.constants.js';
import { MandatePoster } from './mandate.poster.js';
import { MandateRepository } from './mandate.repository.js';
import { MandateSchema } from './mandate.schema.js';
import { MandateService } from './mandate.service.js';
import { MandateStore } from './mandate.store.js';
import { MandatesController } from './mandates.controller.js';

/**
 * Direct-debit mandates: setup, collection, cancellation and the guarantee.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is taken from `AccountsModule`, not from `LedgerModule` — the ledger's
 * instance is bound to an in-memory balance port and would write customer balances to a map
 * that dies with the process. Every module that moves customer money takes the accounts
 * lane's instance; the same note applies here as to transfers, FX, bill pay and payment
 * requests.
 *
 * `BalanceService` comes from `HoldsModule`, because availability is ledger minus holds plus
 * facility and only the module that owns holds can answer it without racing the module that
 * places them.
 *
 * There is no rail here. A direct debit is collected through the scheme the bank is itself a
 * member of, so the "external party" is the merchant's bank rather than a third-party
 * gateway — the movement is booked directly and the guarantee is the bank's own promise, not
 * a rail's.
 */
@Module({
  imports: [
    JobsModule,
    MongooseModule.forFeature([{ name: MANDATE_MODEL, schema: MandateSchema }]),
    AccountsModule,
    HoldsModule,
    TransactionsModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [MandatesController],
  providers: [
    { provide: MandateStore, useClass: MandateRepository },
    MandateService,
    MandatePoster,
    MandateCollectionService,
    MandateDisputeService,
    MandateCollectionProcessor,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    MandateStore,
    MandateService,
    MandateCollectionService,
    MandateDisputeService,
    MandatePoster,
  ],
})
export class MandatesModule {}
