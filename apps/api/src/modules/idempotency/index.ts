/**
 * Public surface of replay protection.
 *
 * Feature modules need one thing: the `@Idempotent()` decorator. `IdempotencyService` is
 * exported for the rare non-HTTP caller — a queue consumer that must not process the same
 * job twice — and everything else stays internal.
 */

export { IdempotencyModule } from './idempotency.module.js';
export {
  IdempotencyService,
  type ClaimOutcome,
  type StoredResponse,
} from './idempotency.service.js';
export { Idempotent, IDEMPOTENT_METADATA } from './idempotent.decorator.js';
export { IdempotencyStatus } from './idempotency-key.schema.js';
export { hashRequest } from './request-hash.js';
