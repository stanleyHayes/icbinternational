/**
 * The disputes module's public surface.
 *
 * Other lanes import from here, never from a file inside. Nothing outside this directory
 * has any business knowing how a case document is shaped, and — deliberately — nothing
 * exported here can move money on its own: the ledger work is behind
 * `DisputeResolutionService`, which will not settle a case that is already decided.
 */

export { DisputesModule } from './disputes.module.js';

export { DisputeRaiseService, type RaiseDisputeInput } from './dispute-raise.service.js';
export { DisputeQueryService } from './dispute-query.service.js';
export { DisputeEvidenceService, type AttachEvidenceInput } from './dispute-evidence.service.js';
export {
  DisputeResolutionService,
  type ResolveDisputeInput,
} from './dispute-resolution.service.js';
export { DisputeProgressionService } from './dispute-progression.service.js';
export { DisputePoster } from './dispute.poster.js';

export {
  DisputeStore,
  type DisputeListQuery,
  type DisputeRecord,
  type DisputeTimelineRecord,
  type DisputeTransition,
  type NewDispute,
} from './dispute.store.js';
export { DisputeRepository } from './dispute.repository.js';
export { InMemoryDisputeStore } from './in-memory-dispute.store.js';

export { DisputeNotifier } from './ports/dispute-notifier.port.js';
export { MerchantResponsePort, type MerchantResponse } from './ports/merchant-response.port.js';

export { toContractDispute, toDisputeRecord } from './dispute.mapper.js';
export { formatDeadline, formatStoredAmount, ledgerLabel } from './dispute-format.js';
export {
  awaitsMerchantResponse,
  deadlineFrom,
  isMerchantResponseDue,
  isOpenStatus,
  isWithinDisputeWindow,
  resolveDisputedAmount,
  statusAfterEvidenceOn,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
} from './domain/dispute-lifecycle.js';
export {
  DECISION_DUE_DAYS,
  DISPUTE_COLLECTION,
  DISPUTE_MODEL,
  DISPUTE_WINDOW_DAYS,
  MAX_EVIDENCE_IDS,
  MERCHANT_RESPONSE_DAYS,
} from './disputes.constants.js';
export { DisputeSchema, DisputeSchemaClass, type DisputeDocument } from './dispute.schema.js';
