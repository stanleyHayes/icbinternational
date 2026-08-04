/**
 * The transfers module's public surface.
 *
 * Other lanes import from here, never from a file inside. The rails that follow — D-03's
 * domestic batches, D-06's standing orders, D-07's payroll files — reuse the quote service,
 * the guard and the booking service rather than reimplementing a payment, which is the only
 * way the bank ends up with one definition of "may this money move".
 */

export { TransfersModule } from './transfers.module.js';

export { TransferQuoteService } from './transfer-quote.service.js';
export { InternalTransferUseCase } from './internal-transfer.use-case.js';
export { TransferExecutionService, type AuthorisedTransfer } from './transfer-execution.service.js';
export { TransferService } from './transfer.service.js';
export { TransferPricingService } from './transfer-pricing.service.js';
export { TransferGuardService } from './transfer-guard.service.js';
export {
  TransferBookingService,
  type BookedEntries,
  type BookingContext,
} from './transfer-booking.service.js';

export {
  TransferStore,
  type NewTransfer,
  type TransferListQuery,
  type TransferRecord,
  type TransferTransitionInput,
} from './transfer.store.js';
export { TransferRepository } from './transfer.repository.js';
export { InMemoryTransferStore } from './in-memory-transfer.store.js';

export {
  QuoteStore,
  type ConsumeQuoteInput,
  type NewQuote,
  type QuoteRecord,
} from './quote.store.js';
export { QuoteRepository, reapAtFor } from './quote.repository.js';
export { InMemoryQuoteStore } from './in-memory-quote.store.js';

export { StepUpPort, stepUpRequired } from './ports/step-up.port.js';
export { TokenStepUpVerifier } from './ports/token-step-up.verifier.js';

export {
  feeKindFor,
  isCancellable,
  limitScopeFor,
  railFor,
  splitAroundFee,
  type TransferAmounts,
} from './transfer-rules.js';
export {
  appendEvent,
  currentStatus,
  settledTimeline,
  toContractTimeline,
  TIMELINE_DETAIL,
  type ContractTransferEvent,
  type TimelineEntry,
} from './transfer-timeline.js';
export { toContractQuote, toContractTransfer } from './transfer.mapper.js';

export {
  DEFAULT_TRANSFER_DESCRIPTION,
  QUOTE_RETENTION_DAYS,
  QUOTE_TTL_MINUTES,
  STEP_UP_HEADER,
  TRANSFER_COLLECTION,
  TRANSFER_FEE_REFERENCE_PREFIX,
  TRANSFER_MODEL,
  TRANSFER_QUOTE_COLLECTION,
  TRANSFER_QUOTE_MODEL,
  TRANSFER_REFERENCE_PREFIX,
  TRANSFER_TRANSACTION_LABEL,
} from './transfer.constants.js';
export { TransferSchema, TransferSchemaClass, type TransferDocument } from './transfer.schema.js';
export {
  TransferQuoteSchema,
  TransferQuoteSchemaClass,
  type TransferQuoteDocument,
} from './quote.schema.js';
