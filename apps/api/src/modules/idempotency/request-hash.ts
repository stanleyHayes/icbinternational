import { createHash } from 'node:crypto';

import { canonicalJson } from '../audit/canonical-json.js';

import { REQUEST_HASH_ALGORITHM } from './idempotency.constants.js';

/**
 * Fingerprints a request so a replay can be told apart from a key being reused.
 *
 * Method and path are included as well as the body, because `POST /transfers` and
 * `POST /payments` with identical bodies are different operations and must not answer
 * each other's replays.
 *
 * Serialisation goes through {@link canonicalJson} — the same function the audit chain
 * uses — so key ordering in the JSON a client happens to send cannot change the
 * fingerprint. A client that re-serialises its retry from an object literal will produce
 * a different byte order for the same payload, and rejecting that as a "reused key" would
 * be maddening and wrong.
 *
 * Headers are deliberately excluded. A retry through a different proxy carries different
 * headers while being unambiguously the same request.
 */
export function hashRequest(request: { method: string; path: string; body: unknown }): string {
  const fingerprint = canonicalJson({
    method: request.method.toUpperCase(),
    path: request.path,
    body: request.body ?? null,
  });

  return createHash(REQUEST_HASH_ALGORITHM).update(fingerprint, 'utf8').digest('hex');
}
