/**
 * Constants for replay protection.
 *
 * The numbers here are contractual, not tuning knobs: a client that has been told its key
 * is good for 24 hours will retry a failed transfer 23 hours later and expect the original
 * answer, not a second transfer.
 */

export const IDEMPOTENCY_KEY_COLLECTION = 'idempotency_keys';

const SECONDS_PER_HOUR = 3600;
const RETENTION_HOURS = 24;

/**
 * How long a key is honoured.
 *
 * Long enough to cover any realistic client retry window, short enough that the collection
 * stays small. MongoDB's TTL monitor uses **real** time, deliberately: retention is
 * housekeeping, and advancing the simulated clock a year forward must not expire a key
 * a customer is still holding.
 */
export const IDEMPOTENCY_KEY_TTL_SECONDS = RETENTION_HOURS * SECONDS_PER_HOUR;

/**
 * Accepted key shape.
 *
 * Bounded because the key is half of a unique index — an unbounded one is a cheap way to
 * blow the index key limit. Restricted to URL-safe characters because keys travel in a
 * header and end up in logs; a UUID or a ULID fits comfortably.
 */
export const MIN_KEY_LENGTH = 8;
export const MAX_KEY_LENGTH = 255;
export const IDEMPOTENCY_KEY_PATTERN = new RegExp(
  `^[\\w.:-]{${MIN_KEY_LENGTH},${MAX_KEY_LENGTH}}$`,
);

/** Digest used for the request fingerprint. */
export const REQUEST_HASH_ALGORITHM = 'sha256';

/**
 * Scope prefix used when no authenticated user is attached to the request.
 *
 * Keys are unique **per caller**, never globally: two customers picking the same UUID must
 * not collide, and one customer must not be able to probe another's stored responses by
 * guessing a key. With no user, the client address is the only caller identity available.
 */
export const ANONYMOUS_SCOPE_PREFIX = 'ip:';
export const UNKNOWN_CALLER_SCOPE = 'ip:unknown';

/** MongoDB reports every unique-index violation as error 11000. */
export const DUPLICATE_KEY_ERROR_CODE = 11_000;

/** Set on a replayed response so a client can tell a replay from a fresh execution. */
export const IDEMPOTENT_REPLAY_HEADER = 'idempotent-replay';
