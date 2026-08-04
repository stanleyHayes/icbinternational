/**
 * Tuning values for the audit trail.
 *
 * They live together because the chain's integrity depends on every writer and every
 * verifier agreeing on them exactly. A genesis hash that differs by one character between
 * the writer and the verifier makes a perfectly sound chain report as tampered.
 */

/** Collection name. Fixed here so a rename cannot silently orphan the history. */
export const AUDIT_EVENT_COLLECTION = 'audit_events';

/** Digest used for the chain. Hex-encoded SHA-256 is 64 characters. */
export const HASH_ALGORITHM = 'sha256';
export const HASH_HEX_LENGTH = 64;

/**
 * The `previousHash` of the very first event.
 *
 * A chain needs an anchor that is not itself a record, otherwise an attacker who deletes
 * the first N events leaves a chain that still verifies from event N+1 onwards.
 */
export const GENESIS_HASH = '0'.repeat(HASH_HEX_LENGTH);

/** Sequence numbers start at one, so `0` can never be a legitimate value. */
export const FIRST_SEQUENCE = 1;

/**
 * Retries when two writers race for the same sequence number.
 *
 * The unique index on `sequence` is what serialises concurrent appends: the loser gets a
 * duplicate-key error, re-reads the tail and tries again. Five attempts is generous —
 * beyond that the contention is pathological and worth surfacing.
 */
export const MAX_APPEND_ATTEMPTS = 5;

/** Events read per round trip while walking the chain. */
export const VERIFY_BATCH_SIZE = 500;

/** Replacement written in place of a secret. Never a partial value. */
export const REDACTED_PLACEHOLDER = '[REDACTED]';

/** Digits of a masked identifier left in the clear, e.g. a card's last four. */
export const MASK_VISIBLE_SUFFIX = 4;

/** Character used for the masked portion of a partially redacted value. */
export const MASK_CHARACTER = '•';

/**
 * Ceiling on a single recorded value.
 *
 * An audit row is evidence, not a payload store. Without a cap, one oversized request
 * body can bloat the collection and slow every verification pass that follows.
 */
export const MAX_VALUE_LENGTH = 512;

/** Ceiling on the recorded user agent. */
export const MAX_USER_AGENT_LENGTH = 256;

/** Depth beyond which a nested object is stored as JSON rather than flattened further. */
export const MAX_FLATTEN_DEPTH = 4;

/** Actor recorded when a change originates from a job or an internal caller. */
export const SYSTEM_ACTOR_ID = 'system';
export const SYSTEM_ACTOR_NAME = 'System';

/** Duplicate-key error number returned by MongoDB for a unique-index violation. */
export const DUPLICATE_KEY_ERROR_CODE = 11_000;
