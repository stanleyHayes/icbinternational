/**
 * The beneficiaries module's public surface.
 *
 * Other lanes import from here, never from a file inside. Transfers needs three things:
 * the destination resolver, the cooling-off gate and — when a customer ticks "save this
 * payee" — the service that writes one. Nothing outside this folder has any business
 * knowing how a payee is stored or how its match keys are derived.
 */

export { BeneficiariesModule } from './beneficiaries.module.js';

export { BeneficiaryService, beneficiaryNotFound } from './beneficiary.service.js';
export { PayeeTrustService, type PayeeStanding } from './payee-trust.service.js';
export {
  PayeeResolverService,
  assertOneInternalIdentifier,
  type ResolvedPayee,
} from './payee-resolver.service.js';

export {
  BeneficiaryStore,
  type BeneficiaryPatchFields,
  type BeneficiaryPatchInput,
  type BeneficiaryQuery,
  type BeneficiaryRecord,
  type NewBeneficiary,
  type TouchBeneficiaryInput,
} from './beneficiary.store.js';
export { BeneficiaryRepository } from './beneficiary.repository.js';
export { InMemoryBeneficiaryStore } from './in-memory-beneficiary.store.js';

export {
  PayeeTrust,
  coolingOffCeiling,
  requiresStepUp,
  stepUpCeiling,
  trustOf,
  withinCoolingOffCeiling,
} from './cooling-off.js';
export { destinationKeys, primaryDestinationKey, resolvedInternalKeys } from './destination-key.js';
export { checkPayeeName, editDistanceWithin, type NameCheckVerdict } from './name-check.js';
export { toContractBeneficiary } from './beneficiary.mapper.js';

export { PayeeDirectoryPort } from './ports/payee-directory.port.js';
export { InMemoryPayeeDirectory, type DirectoryEntry } from './ports/in-memory-payee-directory.js';
export { UserPayeeDirectoryAdapter } from './ports/user-payee-directory.adapter.js';
export { PayeeNamePort } from './ports/payee-name.port.js';
export { ResolverPayeeNameAdapter } from './ports/resolver-payee-name.adapter.js';

export {
  listBeneficiariesQuerySchema,
  updateBeneficiaryRequestSchema,
  verifyPayeeNameRequestSchema,
  verifyPayeeNameResponseSchema,
  type ListBeneficiariesQuery,
  type UpdateBeneficiaryRequest,
  type VerifyPayeeNameRequest,
  type VerifyPayeeNameResponse,
} from './beneficiaries.dto.js';

export {
  BENEFICIARY_COLLECTION,
  BENEFICIARY_MODEL,
  BENEFICIARY_TRANSACTION_LABEL,
  COOLING_OFF_HOURS,
  COOLING_OFF_THRESHOLD_MAJOR,
  MAX_BENEFICIARIES_PER_CUSTOMER,
  STEP_UP_THRESHOLD_MAJOR,
} from './beneficiary.constants.js';
export {
  BeneficiarySchema,
  BeneficiarySchemaClass,
  type BeneficiaryDocument,
} from './beneficiary.schema.js';
