import { SetMetadata } from '@nestjs/common';

/** Metadata key the interceptor reads. Namespaced so it cannot collide with a library's. */
export const IDEMPOTENT_METADATA = 'reliance:idempotent';

/**
 * Requires an `Idempotency-Key` header and replays the original response for a repeat.
 *
 * Put it on every endpoint that moves value. A network timeout tells the client nothing
 * about whether the server acted, so a client that cannot safely retry will either retry
 * anyway — sending the money twice — or refuse to, and strand a payment in an unknown
 * state. Both are worse than requiring one header.
 *
 * The decorator takes no options on purpose. Every knob here is a way for one endpoint to
 * be less safe than its neighbours, and "which of our transfer endpoints have replay
 * protection?" must have exactly one answer.
 *
 * ```ts
 * ⁠@Post(routes.transfers.internal)
 * ⁠@Idempotent()
 * async create(@Body(zodBody(createTransferSchema)) body: CreateTransfer) { … }
 * ```
 */
export function Idempotent(): MethodDecorator {
  return SetMetadata(IDEMPOTENT_METADATA, true);
}
