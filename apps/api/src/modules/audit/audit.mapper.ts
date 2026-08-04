import { type AuditEvent } from '@reliance/contracts';

import { type AuditActorType, type AuditChange, type HashableAuditEvent } from './audit.types.js';

/**
 * Conversions between the stored document, the hashed payload and the wire DTO.
 *
 * Kept in one file because the three shapes must stay aligned: if a field is added to the
 * document but not to the hashed payload it silently falls outside the chain's protection,
 * which is the worst possible failure mode — the record looks audited and is not.
 */

/** Anything carrying the hashed fields: a stored document or an about-to-be-stored draft. */
export interface HashableSource {
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
  readonly at: Date | string;
}

/** A stored event, which additionally carries its chain links. */
export type StoredSource = HashableSource & {
  readonly previousHash: string;
  readonly hash: string;
};

/**
 * Projects an event onto exactly the fields the chain hash covers.
 *
 * Field-by-field rather than a spread: a spread would silently absorb Mongoose's `_id`,
 * `__v` and timestamps, and any of those changing — a re-index, a driver upgrade — would
 * invalidate the entire history.
 */
export function toHashable(event: HashableSource): HashableAuditEvent {
  return {
    id: event.id,
    sequence: event.sequence,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    changes: event.changes.map((change) => ({
      field: change.field,
      before: change.before,
      after: change.after,
    })),
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    traceId: event.traceId,
    at: event.at instanceof Date ? event.at.toISOString() : event.at,
  };
}

/** Stored document → the contract DTO the operations console consumes. */
export function toContract(event: StoredSource): AuditEvent {
  const hashable = toHashable(event);

  return {
    ...hashable,
    // The contract's `changes` is mutable; the hashed view is readonly. Copy rather than
    // cast, so a consumer mutating the DTO cannot reach back into what was hashed.
    changes: [...hashable.changes],
    previousHash: event.previousHash,
    hash: event.hash,
  };
}
