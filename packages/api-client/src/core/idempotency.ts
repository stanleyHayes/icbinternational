/**
 * Idempotency keys for money-moving requests.
 *
 * The key's whole value is that it is *stable across retries of the same user
 * intention*. A key minted fresh inside the transport on every attempt protects against
 * nothing, so generation is a caller-visible step: mint one when the user presses
 * "Send", keep it for as long as that intention lives, and hand the same one to every
 * retry the UI performs.
 */

import type { MutationOptions } from './types.js';

/** Mints a fresh key. One per user intention, not one per HTTP attempt. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Attaches an idempotency key to a set of mutation options, minting one if absent.
 *
 * Reuse the returned object across retries:
 * ```ts
 * const send = withIdempotencyKey();
 * await client.transfers.create(body, send);   // times out
 * await client.transfers.create(body, send);   // safe: the API deduplicates
 * ```
 */
export function withIdempotencyKey<T extends MutationOptions>(
  options?: T,
): T & { idempotencyKey: string } {
  const base = (options ?? ({} as T)) as T;
  return { ...base, idempotencyKey: base.idempotencyKey ?? newIdempotencyKey() };
}

/**
 * Attaches proof of a recent step-up authentication.
 *
 * Kept beside the idempotency helper because the two travel together on exactly the
 * routes the contract marks `🔐`: a step-up token without an idempotency key means a
 * re-authenticated user can still double-spend on a flaky connection.
 */
export function withStepUpToken<T extends MutationOptions>(
  token: string,
  options?: T,
): T & { stepUpToken: string } {
  return { ...((options ?? {}) as T), stepUpToken: token };
}
