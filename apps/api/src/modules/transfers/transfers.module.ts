import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { BeneficiariesModule } from '../beneficiaries/index.js';
import { FeesModule } from '../fees/fees.module.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LimitsModule } from '../limits/limits.module.js';
import { ProductsModule } from '../products/index.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { InternalTransferUseCase } from './internal-transfer.use-case.js';
import { StepUpPort } from './ports/step-up.port.js';
import { TokenStepUpVerifier } from './ports/token-step-up.verifier.js';
import { QuoteRepository } from './quote.repository.js';
import { TransferQuoteSchema } from './quote.schema.js';
import { QuoteStore } from './quote.store.js';
import { TransferBookingService } from './transfer-booking.service.js';
import { TransferExecutionService } from './transfer-execution.service.js';
import { TransferGuardService } from './transfer-guard.service.js';
import { TransferPricingService } from './transfer-pricing.service.js';
import { TransferQuoteService } from './transfer-quote.service.js';
import { TRANSFER_MODEL, TRANSFER_QUOTE_MODEL } from './transfer.constants.js';
import { TransferRepository } from './transfer.repository.js';
import { TransferSchema } from './transfer.schema.js';
import { TransferService } from './transfer.service.js';
import { TransferStore } from './transfer.store.js';
import { TransfersController } from './transfers.controller.js';

/**
 * Moving money between two accounts inside Reliance.
 *
 * ## Where the collaborators come from, and why
 *
 * `PostingService` is imported from `AccountsModule`, **not** from `LedgerModule`. The
 * ledger binds `AccountBalancePort` to an in-memory default, so the `PostingService` it
 * exports writes customer balances to a map that dies with the process; the accounts lane
 * re-provides one bound to the Mongo-backed port. Every module that moves customer money
 * has to take that instance until the ledger handoff lands — see the note on
 * `AccountsModule`.
 *
 * `BalanceService` comes from `HoldsModule` because availability is not a property of an
 * account document: it is ledger minus holds plus facility, and only the module that owns
 * holds can answer it without racing the module that places them.
 *
 * `BeneficiariesModule` sits below this one. "Who is this payee, and may they be paid this
 * much?" has to be answerable by anything that moves money — transfers today, bill pay and
 * standing orders next — so the dependency runs one way and stays that way.
 *
 * `TransactionsModule` supplies the projector, called inside the posting session so the
 * statement line and the money commit together. `IdempotencyModule` and `AuditModule`
 * register their interceptors globally; importing them here is what guarantees they are
 * present rather than assumed.
 */
@Module({
  imports: [
    LimitsModule,
    FeesModule,
    MongooseModule.forFeature([
      { name: TRANSFER_MODEL, schema: TransferSchema },
      { name: TRANSFER_QUOTE_MODEL, schema: TransferQuoteSchema },
    ]),
    AccountsModule,
    HoldsModule,
    BeneficiariesModule,
    ProductsModule,
    TransactionsModule,
    IdempotencyModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [TransfersController],
  providers: [
    { provide: TransferStore, useClass: TransferRepository },
    { provide: QuoteStore, useClass: QuoteRepository },
    { provide: StepUpPort, useClass: TokenStepUpVerifier },
    TransferPricingService,
    TransferGuardService,
    TransferQuoteService,
    TransferBookingService,
    TransferExecutionService,
    InternalTransferUseCase,
    TransferService,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    TransferStore,
    QuoteStore,
    TransferService,
    TransferQuoteService,
    InternalTransferUseCase,
    StepUpPort,
  ],
})
export class TransfersModule {}
