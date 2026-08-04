/**
 * The card network rail's public surface.
 *
 * The cards lane imports from here and never from a file inside, so the split between
 * "what the scheme decides" and "what the bank decides" stays a boundary rather than a
 * convention. Swapping this simulator for a real scheme connector is then a change of one
 * provider, not a change to the authorisation path.
 */

export { CardNetworkModule } from './card-network.module.js';
export { CardNetworkSimulator } from './card-network.simulator.js';

export {
  APPROVAL_RESPONSE_CODE,
  DECLINE_DESCRIPTORS,
  declineDescriptorFor,
  responseCodeFor,
  type DeclineDescriptor,
} from './decline-codes.js';

export {
  ThreeDsOutcome,
  ThreeDsRequirement,
  type NetworkAuthorisationContext,
  type NetworkAuthorisationRequest,
  type SettlementBatch,
  type SettlementItem,
} from './network-message.js';

export { closeSettlementBatch, interchangeOn, settlementBatchId } from './settlement-batch.js';

export {
  seededChance,
  seededInt,
  seededPick,
  seededString,
  seedHash,
} from './deterministic-random.js';

export {
  AUTHORISATION_VALIDITY_HOURS,
  BASIS_POINTS_TOTAL,
  CARD_BINS,
  CARD_VALIDITY_YEARS,
  CVV_LENGTH,
  INTERCHANGE_BPS,
  LAST4_LENGTH,
  LOW_VALUE_EXEMPTION_MINOR,
  MAX_INCREMENTAL_AUTHORISATIONS,
  PAN_LENGTH,
  REFERENCE_ALPHABET,
  type BinRange,
  type CardChannel,
} from './card-network.constants.js';
