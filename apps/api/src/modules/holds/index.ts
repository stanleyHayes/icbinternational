/**
 * The holds module's public surface.
 *
 * `BalanceService` is the one every other lane wants: transfers, cards and payments all
 * have to ask "can this account cover it" and none of them may answer that question for
 * itself.
 */

export { HoldsModule } from './holds.module.js';

export { BalanceService, type BalanceMoveInput } from './balance.service.js';
export { HoldService, type PlaceHoldInput, type ResolveWithinInput } from './hold.service.js';
export { HoldCaptureService, type CaptureHoldInput } from './hold-capture.service.js';
export { captureEntryFor, isCapturable, type CaptureEntryInput } from './capture-recipes.js';

export {
  HoldStore,
  type ExpiredHoldQuery,
  type HoldRecord,
  type NewHold,
  type ResolveHoldInput,
} from './hold.store.js';
export { HoldRepository } from './hold.repository.js';
export { InMemoryHoldStore } from './in-memory-hold.store.js';

export { toContractHold } from './hold.mapper.js';
export { HoldSchema, HoldSchemaClass, type HoldDocument } from './hold.schema.js';
export {
  HOLD_COLLECTION,
  HOLD_EXPIRY_BATCH,
  HOLD_MODEL,
  HOLD_TRANSACTION_LABEL,
} from './hold.constants.js';
