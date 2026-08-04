import { computeAuditHash, genesisHash } from './audit-hash.js';
import { FIRST_SEQUENCE, VERIFY_BATCH_SIZE } from './audit.constants.js';
import { toHashable, type StoredSource } from './audit.mapper.js';
import { type AuditChainVerification } from './audit.types.js';

/**
 * Chain verification.
 *
 * The walk is deliberately dumb: start at the genesis anchor, and for every event check
 * three things — it occupies the expected sequence position, its `previousHash` is the
 * hash of the event before it, and its stored `hash` is still the hash of its contents.
 * Any edit, deletion, insertion or reordering breaks at least one of those at the exact
 * place it happened, so the report points at the earliest broken event rather than at
 * some downstream symptom of it.
 *
 * The database is hidden behind {@link ChainBatchReader} so the walk itself is pure and
 * testable without MongoDB — the same function backs the `pnpm audit:verify` command,
 * the admin verification endpoint and the integration tests.
 */

/** Reads the chain ascending from `fromSequence` (inclusive), at most `limit` events. */
export type ChainBatchReader = (fromSequence: number, limit: number) => Promise<StoredSource[]>;

/** What the walk expects the next event to look like. */
interface ChainExpectation {
  readonly sequence: number;
  readonly previousHash: string;
}

const REASON_SEQUENCE_GAP = 'sequence gap — an event was deleted or inserted';
const REASON_BROKEN_LINK = 'previousHash does not match the hash of the preceding event';
const REASON_CONTENT_CHANGED = 'stored hash no longer matches the event contents';

/**
 * Checks one event against its expected chain position.
 *
 * Returns `null` when the link is sound, or a human-readable reason naming the exact
 * property that failed — the operator reading the report should not have to re-derive
 * which of the three checks fired.
 */
export function checkChainLink(event: StoredSource, expected: ChainExpectation): string | null {
  if (event.sequence !== expected.sequence) {
    return `${REASON_SEQUENCE_GAP} (expected sequence ${expected.sequence}, found ${event.sequence})`;
  }

  if (event.previousHash !== expected.previousHash) {
    return REASON_BROKEN_LINK;
  }

  const recomputed = computeAuditHash(event.previousHash, toHashable(event));
  if (recomputed !== event.hash) {
    return REASON_CONTENT_CHANGED;
  }

  return null;
}

/**
 * Walks the whole chain from the genesis anchor to the tail.
 *
 * @param readBatch Pages the events in ascending sequence order.
 * @param checkedAt ISO-8601 instant stamped on the report — injected because the walk
 *   is pure and time is a `ClockService` concern.
 */
export async function verifyAuditChain(
  readBatch: ChainBatchReader,
  checkedAt: string,
): Promise<AuditChainVerification> {
  let expected: ChainExpectation = { sequence: FIRST_SEQUENCE, previousHash: genesisHash() };
  let eventsChecked = 0;

  for (;;) {
    const batch = await readBatch(expected.sequence, VERIFY_BATCH_SIZE);
    if (batch.length === 0) break;

    for (const event of batch) {
      eventsChecked += 1;
      const reason = checkChainLink(event, expected);
      if (reason !== null) return broken(eventsChecked, event.sequence, reason, checkedAt);
      expected = { sequence: event.sequence + 1, previousHash: event.hash };
    }

    if (batch.length < VERIFY_BATCH_SIZE) break;
  }

  return {
    verified: true,
    eventsChecked,
    firstBrokenSequence: null,
    reason: null,
    checkedAt,
  };
}

/** The report for a chain that failed, pointing at the earliest broken event. */
function broken(
  eventsChecked: number,
  sequence: number,
  reason: string,
  checkedAt: string,
): AuditChainVerification {
  return { verified: false, eventsChecked, firstBrokenSequence: sequence, reason, checkedAt };
}
