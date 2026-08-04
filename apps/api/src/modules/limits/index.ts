/**
 * The limits module's public surface.
 *
 * Other feature modules import from here, never from a file inside. That keeps the
 * internal layout — how tier caps are tabled, how overrides are stored — free to
 * change without a cross-module edit.
 */

export { LimitsModule } from './limits.module.js';
export { LimitsEngineService, type LimitCheckInput } from './limits-engine.service.js';
export { LimitOverrideService, type OverrideActor } from './limit-override.service.js';
export {
  resolveEffectiveMatrix,
  type EffectiveLimitInput,
  type LimitOverride,
} from './limit-override.js';
export { clampMatrixForTier, tierCapsFor } from './kyc-tier-caps.js';
export { LimitChannel, toLimitChannel } from './limit-channel.js';
export { type LimitOverrideView } from './limit-override.mapper.js';
export {
  createLimitOverrideRequestSchema,
  limitScopeSchema,
  type CreateLimitOverrideRequest,
} from './limits.dto.js';
export { ANY_CHANNEL, MAX_OVERRIDE_DAYS } from './limits.constants.js';
