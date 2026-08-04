/**
 * The mandates module's public surface.
 *
 * Other lanes import from here, never from a file inside. The simulation lane drives
 * collections through `MandateCollectionService`; the support and risk lanes reach the
 * guarantee through `MandateDisputeService`.
 */

export { MandatesModule } from './mandates.module.js';

export {
  MandateService,
  alreadyCancelled,
  assertNotCancelled,
  type MandateSetup,
} from './mandate.service.js';
export { MandateCollectionService } from './mandate-collection.service.js';
export { MandateDisputeService } from './mandate-dispute.service.js';
export { MandatePoster, type CollectedEntries } from './mandate.poster.js';
export {
  MandateCollectionProcessor,
  type CollectionSweepResult,
} from './mandate-collection.processor.js';

export {
  MandateStore,
  type MandateCollection,
  type MandateListQuery,
  type MandateRecord,
  type MandateTransition,
  type NewMandate,
  type RecordCollectionInput,
  type RecordRefundInput,
} from './mandate.store.js';
export { MandateRepository } from './mandate.repository.js';
export { InMemoryMandateStore } from './in-memory-mandate.store.js';

export { toContractMandate } from './mandate.mapper.js';

export {
  ADVANCE_NOTICE_DAYS,
  FREQUENCY_DAYS,
  GUARANTEE_REFUND_DESCRIPTION,
  GUARANTEE_WINDOW_DAYS,
  MANDATE_COLLECTION_JOB,
  MANDATE_COLLECTION_NAME,
  MANDATE_MODEL,
  MandateFrequency,
  RETAINED_COLLECTIONS,
} from './mandate.constants.js';
export { MandateSchema, MandateSchemaClass, type MandateDocument } from './mandate.schema.js';
