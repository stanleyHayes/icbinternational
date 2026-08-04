import { createHash } from 'node:crypto';

import { GENESIS_HASH, HASH_ALGORITHM, HASH_HEX_LENGTH } from './audit.constants.js';
import { type HashableAuditEvent } from './audit.types.js';
import { canonicalJson } from './canonical-json.js';

/**
 * The chain link.
 *
 * `hash = sha256(previousHash ‖ canonicalJson(event))`. Because every hash consumes its
 * predecessor, editing event *n* changes its hash, which invalidates the `previousHash`
 * stored on event *n+1*, and so on to the tail. There is no way to rewrite one row of
 * history without rewriting every row after it — and the verifier reports the earliest
 * break, which is where the edit happened.
 *
 * This is tamper *evidence*, not tamper *prevention*. Someone with write access to the
 * collection can recompute the whole chain. What they cannot do is change one record
 * quietly, and that is the property an auditor needs.
 */
export function computeAuditHash(previousHash: string, event: HashableAuditEvent): string {
  return createHash(HASH_ALGORITHM)
    .update(previousHash + canonicalJson(event), 'utf8')
    .digest('hex');
}

/** True when a string is shaped like one of our digests. Cheap sanity check, not a proof. */
export function isChainHash(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${HASH_HEX_LENGTH}}$`).test(value);
}

/** The anchor a first event must point at. Exported so callers never hard-code zeroes. */
export function genesisHash(): string {
  return GENESIS_HASH;
}
