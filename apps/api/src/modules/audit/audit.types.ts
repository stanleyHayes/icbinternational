import { type AuditEvent } from '@reliance/contracts';

/**
 * Types shared by the writer, the hasher and the verifier.
 *
 * They live in their own file so the hash function can describe exactly what it covers
 * without importing the diff engine, and the diff engine can produce changes without
 * importing the hasher. A cycle between those two would be a design smell in a component
 * whose whole value is being simple enough to trust.
 */

/** Who caused the change. Derived from the contract so the two cannot drift apart. */
export type AuditActorType = AuditEvent['actorType'];

export const AuditActorType: Record<AuditActorType, AuditActorType> = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
  JOB: 'JOB',
};

/** One field-level difference. `null` means the field was absent on that side. */
export type AuditChange = AuditEvent['changes'][number];

/** The actor attributed to an event. */
export interface AuditActor {
  readonly type: AuditActorType;
  readonly id: string;
  readonly name: string;
}

/**
 * Everything the chain hash covers.
 *
 * Deliberately excludes `previousHash` and `hash`: the previous hash is concatenated in
 * separately by {@link computeAuditHash}, and hashing a value into itself is impossible.
 * Adding a persisted field here without a migration invalidates every historical event,
 * so the set is a versioned decision, not an incidental one.
 */
export interface HashableAuditEvent {
  readonly id: string;
  readonly sequence: number;
  readonly actorType: AuditActorType;
  readonly actorId: string;
  readonly actorName: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly changes: readonly AuditChange[];
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly traceId: string;
  /** ISO-8601 UTC. A `Date` would hash differently depending on the driver's decoding. */
  readonly at: string;
}

/** Result of walking the chain from the genesis anchor to the tail. */
export interface AuditChainVerification {
  readonly verified: boolean;
  readonly eventsChecked: number;
  /** Sequence of the first event that failed a check, or `null` when the chain is sound. */
  readonly firstBrokenSequence: number | null;
  /** Why that event failed, for the operator reading the report. */
  readonly reason: string | null;
  readonly checkedAt: string;
}
