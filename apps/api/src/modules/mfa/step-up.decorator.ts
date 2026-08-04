import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { StepUpGuard } from './step-up.guard.js';

/** Metadata key the guard reads to learn a route requires a fresh re-authentication. */
export const STEP_UP_METADATA_KEY = 'reliance:step-up-required';

/**
 * Marks an endpoint as sensitive: the caller must present a step-up token minted within
 * the configured window (five minutes by default) in the `x-step-up-token` header.
 *
 * ```ts
 * @Delete(routes.mfa.totpDisable)
 * @StepUp()
 * @UseGuards(JwtAuthGuard, CsrfGuard)
 * disable(...) { ... }
 * ```
 *
 * The guard only *checks* the proof; it does not authenticate the caller. Order is
 * load-bearing: Nest appends each decorator's guards in evaluation order (bottom-up), so
 * `@StepUp()` must be written ABOVE `@UseGuards(JwtAuthGuard, …)` for the identity guard
 * to run first — the proof is matched against the session it was minted for, and a valid
 * token belonging to someone else is refused.
 */
export function StepUp(): MethodDecorator {
  return applyDecorators(SetMetadata(STEP_UP_METADATA_KEY, true), UseGuards(StepUpGuard));
}
