/**
 * The overdraft module's public surface.
 *
 * The simulation lane drives the daily charge; the accounts lane needs the utilisation
 * split to explain a negative balance. Neither has any business knowing how a facility is
 * stored.
 */

export { OverdraftModule } from './overdraft.module.js';

export {
  assignableLimit,
  dailyInterest,
  roundDownToStep,
  utilisationOf,
  type Utilisation,
} from './overdraft-pricing.js';

export {
  ARRANGED_RATE_BPS,
  FACILITY_SHARE_OF_INCOME_BPS,
  INTEREST_FREE_BUFFER_MINOR_UNITS,
  LIMIT_GRANULARITY_MINOR_UNITS,
  MAX_AUTOMATED_LIMIT_MINOR_UNITS,
  MINIMUM_FACILITY_SCORE,
  OVERDRAFT_COLLECTION,
  OVERDRAFT_MODEL,
  OVERDRAFT_REFERENCE_PREFIX,
  OVERDRAFT_TRANSACTION_LABEL,
  UNARRANGED_RATE_BPS,
} from './overdraft.constants.js';

export {
  OverdraftSchema,
  OverdraftSchemaClass,
  type OverdraftDocument,
} from './overdraft.schema.js';

export { OverdraftService } from './overdraft.service.js';
export { OverdraftAssessment } from './overdraft-assessment.service.js';
export { OverdraftInterestService } from './overdraft-interest.service.js';

export {
  OverdraftStatus,
  OverdraftStore,
  type AccrualQuery,
  type InsertOverdraftResult,
  type NewOverdraft,
  type OverdraftPatchFields,
  type OverdraftRecord,
} from './overdraft.store.js';
export { InMemoryOverdraftStore } from './in-memory-overdraft.store.js';

export { toOverdraftFacility } from './overdraft.mapper.js';
export * from './overdraft.dto.js';
