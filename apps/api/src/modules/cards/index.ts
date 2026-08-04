/**
 * The cards module's public surface.
 *
 * Other lanes import from here, never from a file inside. The simulation console drives
 * authorisations, captures and settlement runs; the jobs lane sweeps expiries; the
 * accounts lane's closure guard needs to know whether an account still has a live card.
 * None of them has any business knowing how a card document is shaped, and — critically —
 * nothing exported from here can produce a card number except `CardSensitiveService`,
 * which is behind step-up at every route that reaches it.
 */

export { CardsModule } from './cards.module.js';

export { CardService, type UpdateCardInput } from './card.service.js';
export { CardFeedService } from './card-feed.service.js';

export { CardIssuingService, type IssueCardInput } from './issuing/card-issuing.service.js';
export { CardDeliveryService } from './issuing/card-delivery.service.js';
export { CardSensitiveService } from './issuing/card-sensitive.service.js';
export { CardFactory, expiryFrom, schemeForTier, type CardDraft } from './issuing/card.factory.js';
export {
  PanTokeniser,
  binFor,
  formatExpiry,
  luhnCheckDigit,
  passesLuhn,
  type MintedCard,
  type RevealedPan,
} from './issuing/pan-tokeniser.js';

export { CardLifecycleService } from './lifecycle/card-lifecycle.service.js';
export { CardPinService } from './lifecycle/card-pin.service.js';
export {
  CardReplacementService,
  type ReplacementResult,
} from './lifecycle/card-replacement.service.js';
export {
  ACTIVATABLE_STATUSES,
  CANCELLABLE_STATUSES,
  REPORTABLE_STATUSES,
  SPENDABLE_STATUSES,
  canTransition,
  isTerminal,
  transitionsFrom,
} from './lifecycle/card-status.rules.js';

export { CardControlsService } from './controls/card-controls.service.js';
export { defaultControlsFor } from './controls/default-controls.js';
export {
  channelDecline,
  controlDecline,
  countryDecline,
  merchantDecline,
  statusDecline,
  type ControlContext,
} from './controls/control-rules.js';
export {
  headroom,
  limitDecline,
  limitSnapshot,
  spentIn,
  type CardLimitSnapshot,
  type LimitUsage,
  type SpendWindows,
} from './controls/spend-limits.js';

export { CardAuthorisationService } from './authorisation/card-authorisation.service.js';
export { AuthorisationLifecycleService } from './authorisation/authorisation-lifecycle.service.js';
export { CardCaptureService } from './authorisation/card-capture.service.js';
export {
  CardRefundService,
  isFullyRefunded,
  refundHeadroom,
} from './authorisation/card-refund.service.js';
export { CardSettlementService } from './authorisation/card-settlement.service.js';
export {
  CardNetworkGateway,
  type NetworkAnswer,
} from './authorisation/authorisation-gateway.service.js';
export { decide, type AuthorisationDecision } from './authorisation/authorisation-decision.js';
export { SpendWindowReader, startOfMonth } from './authorisation/spend-window.reader.js';

export {
  AuthorisationStore,
  type AuthorisationChannel,
  type AuthorisationRecord,
  type NewAuthorisation,
} from './authorisation/authorisation.store.js';
export { AuthorisationRepository } from './authorisation/authorisation.repository.js';
export { InMemoryAuthorisationStore } from './authorisation/in-memory-authorisation.store.js';

export {
  CardStore,
  type CardPatchFields,
  type CardPatchInput,
  type CardQuery,
  type CardRecord,
  type NewCard,
  type StoredCardControls,
} from './card.store.js';
export { CardRepository } from './card.repository.js';
export { InMemoryCardStore } from './in-memory-card.store.js';

export {
  CardInsightsService,
  type CardInsights,
  type CategorySpend,
} from './insights/card-insights.service.js';
export {
  detectSubscriptions,
  type DetectedSubscription,
  type SubscriptionCadence,
} from './insights/subscription-detection.js';
export { allCategories, categoryFor, labelFor } from './insights/mcc-catalogue.js';

export { toContractAuthorisation, toContractCard, toContractControls } from './card.mapper.js';
export { authorisationDeclined, cardNotFound } from './card.errors.js';
export {
  CARD_AUTHORISATION_MODEL,
  CARD_COLLECTION,
  CARD_MODEL,
  MAX_CARDS_PER_ACCOUNT,
  MAX_PIN_ATTEMPTS,
} from './card.constants.js';
export { CardSchema, CardSchemaClass, type CardDocument } from './card.schema.js';
export {
  AuthorisationSchema,
  AuthorisationSchemaClass,
  type AuthorisationDocument,
} from './authorisation/authorisation.schema.js';
