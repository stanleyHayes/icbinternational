import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { CardNetworkModule } from '../../rails/card-network/index.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { HoldsModule } from '../holds/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

import { AdminCardsController } from './admin-cards.controller.js';
import { AuthorisationBookingService } from './authorisation/authorisation-booking.service.js';
import { CardNetworkGateway } from './authorisation/authorisation-gateway.service.js';
import { AuthorisationGuardService } from './authorisation/authorisation-guard.service.js';
import { AuthorisationLifecycleService } from './authorisation/authorisation-lifecycle.service.js';
import { AuthorisationRepository } from './authorisation/authorisation.repository.js';
import { AuthorisationSchema } from './authorisation/authorisation.schema.js';
import { AuthorisationStore } from './authorisation/authorisation.store.js';
import { CardAuthorisationService } from './authorisation/card-authorisation.service.js';
import { CardCaptureService } from './authorisation/card-capture.service.js';
import { CardRefundService } from './authorisation/card-refund.service.js';
import { CardSettlementService } from './authorisation/card-settlement.service.js';
import { CardTransactionLinker } from './authorisation/card-transaction.linker.js';
import { SpendWindowReader } from './authorisation/spend-window.reader.js';
import { CardDetailsController } from './card-details.controller.js';
import { CardFeedController } from './card-feed.controller.js';
import { CardFeedService } from './card-feed.service.js';
import { CARD_AUTHORISATION_MODEL, CARD_MODEL } from './card.constants.js';
import { CardRepository } from './card.repository.js';
import { CardSchema } from './card.schema.js';
import { CardService } from './card.service.js';
import { CardStore } from './card.store.js';
import { CardsController } from './cards.controller.js';
import { CardControlsService } from './controls/card-controls.service.js';
import { CardInsightsService } from './insights/card-insights.service.js';
import { CardDeliveryService } from './issuing/card-delivery.service.js';
import { CardIssuingService } from './issuing/card-issuing.service.js';
import { CardSensitiveService } from './issuing/card-sensitive.service.js';
import { CardFactory } from './issuing/card.factory.js';
import { PanTokeniser } from './issuing/pan-tokeniser.js';
import { CardLifecycleService } from './lifecycle/card-lifecycle.service.js';
import { CardPinService } from './lifecycle/card-pin.service.js';
import { CardReplacementService } from './lifecycle/card-replacement.service.js';

/**
 * Debit cards: issuing, lifecycle, controls, authorisation and insights.
 *
 * ## Where the collaborators come from, and why
 *
 * `HoldsModule` supplies `HoldService` and `HoldCaptureService`. A card authorisation
 * *is* a hold — value the customer still owns and cannot spend — and capture is what
 * turns it into a posting. Rebuilding either here would give the bank two ways to reserve
 * money and two places for the availability arithmetic to be wrong.
 *
 * `AccountsModule` supplies `AccountService` and, through the holds lane, the
 * `PostingService` bound to the Mongo-backed balance port. `LedgerModule`'s own instance
 * writes customer balances to a map that dies with the process — see the note on
 * `AccountsModule` — so every module that moves customer money takes the accounts one.
 * The refund path here injects `PostingService`, and the import order guarantees it
 * resolves to that instance.
 *
 * `CardNetworkModule` is a rail. It decides what a scheme decides — references, outages,
 * 3DS, expiry windows — and knows nothing about this module, which is what lets the
 * authorisation path be tested with the rail stubbed.
 *
 * `MfaModule` is imported for `StepUpGuard`, which the `@StepUp()` decorator on the
 * reveal, PIN and controls routes resolves. Importing it is what makes those routes
 * genuinely protected rather than decorated.
 *
 * `TransactionsModule` supplies the projector, called inside the capture session so the
 * statement line and the money commit together.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CARD_MODEL, schema: CardSchema },
      { name: CARD_AUTHORISATION_MODEL, schema: AuthorisationSchema },
    ]),
    CardNetworkModule,
    AccountsModule,
    HoldsModule,
    LedgerModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
    MfaModule,
    IdempotencyModule,
    AuditModule,
    RbacModule,
  ],
  controllers: [AdminCardsController, CardsController, CardDetailsController, CardFeedController],
  providers: [
    { provide: CardStore, useClass: CardRepository },
    { provide: AuthorisationStore, useClass: AuthorisationRepository },

    PanTokeniser,
    CardFactory,
    CardIssuingService,
    CardDeliveryService,
    CardSensitiveService,

    CardService,
    CardPinService,
    CardLifecycleService,
    CardReplacementService,
    CardControlsService,

    SpendWindowReader,
    CardNetworkGateway,
    AuthorisationGuardService,
    AuthorisationBookingService,
    CardAuthorisationService,
    AuthorisationLifecycleService,
    CardTransactionLinker,
    CardCaptureService,
    CardRefundService,
    CardSettlementService,

    CardFeedService,
    CardInsightsService,

    // Provided locally, as the accounts and holds lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
    TransactionRunner,
  ],
  exports: [
    CardStore,
    AuthorisationStore,
    CardService,
    CardIssuingService,
    CardDeliveryService,
    CardLifecycleService,
    CardReplacementService,
    CardControlsService,
    CardAuthorisationService,
    AuthorisationLifecycleService,
    CardCaptureService,
    CardRefundService,
    CardSettlementService,
    CardInsightsService,
    CardFeedService,
  ],
})
export class CardsModule {}
