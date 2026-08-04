import { Injectable } from '@nestjs/common';

import { ErrorCode, type AuditEvent } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import { diffSnapshots } from './audit-diff.js';
import { AuditEventRepository, type NewAuditEvent } from './audit-event.repository.js';
import { computeAuditHash, genesisHash } from './audit-hash.js';
import { redactChanges } from './audit-redaction.js';
import { FIRST_SEQUENCE, MAX_APPEND_ATTEMPTS } from './audit.constants.js';
import { toContract, toHashable } from './audit.mapper.js';
import { type AuditActor, type AuditChange } from './audit.types.js';

/** What {@link AuditService.record} needs to write one event. */
export interface RecordAuditInput {
  readonly actor: AuditActor;
  /** Dotted verb, e.g. `account.freeze`. */
  readonly action: string;
  /** Entity type, e.g. `account`. */
  readonly entity: string;
  readonly entityId: string;
  /** Pre-mutation snapshot; omit for a creation. */
  readonly before?: Record<string, unknown> | null;
  /** Post-mutation snapshot; omit for a deletion. */
  readonly after?: Record<string, unknown> | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly traceId: string;
  /** Switches the diff to an allow-list — use on entities that are mostly personal data. */
  readonly allowFields?: readonly string[];
}

/**
 * The append-only writer every audited change goes through.
 *
 * One event is built in three passes: the snapshots are diffed so only real movement is
 * recorded, the diff is redacted so no secret can ever reach the collection, and the
 * event is then chained onto the current tail. Redaction lives here rather than at the
 * call site precisely so a new caller cannot forget it.
 *
 * The chain link is what makes the retry loop necessary. Two writers can read the same
 * tail and compute the same next sequence; the unique index on `sequence` decides which
 * of them lands, and the loser re-reads the new tail and tries again. That is cheaper and
 * far more robust than a lock, because a lock held by a crashed process stops the bank.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly events: AuditEventRepository,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  /** Records a state change as a redacted before/after diff. Returns the stored event. */
  async record(input: RecordAuditInput): Promise<AuditEvent> {
    const changes = redactChanges(diffSnapshots(input.before ?? null, input.after ?? null), {
      allowFields: input.allowFields,
    });

    return this.append({
      actor: input.actor,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      changes,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      traceId: input.traceId,
    });
  }

  /** Most recent events for one entity — the ops console's per-record history view. */
  async historyFor(entity: string, entityId: string, limit: number): Promise<AuditEvent[]> {
    const documents = await this.events.findForEntity(entity, entityId, limit);
    return documents.map((document) => toContract(document));
  }

  /**
   * Chains one event onto the current tail, retrying when a concurrent writer wins.
   *
   * The hash is computed inside the loop, not before it: after a lost race the tail has
   * moved, and the event must be re-anchored on the new tail rather than appended with a
   * stale `previousHash` — which would itself be a broken link.
   */
  private async append(draft: AuditDraft): Promise<AuditEvent> {
    const at = this.clock.now();

    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
      const event = this.chainOntoTail(draft, await this.events.findLatest(), at);
      const saved = await this.events.append(event);
      if (saved) return toContract(event);
    }

    // Losing this race MAX_APPEND_ATTEMPTS times running is not contention, it is a
    // missing index or a runaway writer. Failing the operation is the honest outcome:
    // an unrecorded change is worse than a rejected one.
    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: 'The audit trail is under heavy write contention. Please retry the operation.',
      context: { action: draft.action, entity: draft.entity, entityId: draft.entityId },
    });
  }

  /** Builds the full event anchored on the given tail (`null` when the chain is empty). */
  private chainOntoTail(draft: AuditDraft, tail: ChainTail, at: Date): NewAuditEvent {
    const sequence = tail ? tail.sequence + 1 : FIRST_SEQUENCE;
    const previousHash = tail ? tail.hash : genesisHash();

    const unsigned = {
      id: this.ids.generate('auditEvent'),
      sequence,
      actorType: draft.actor.type,
      actorId: draft.actor.id,
      actorName: draft.actor.name,
      action: draft.action,
      entity: draft.entity,
      entityId: draft.entityId,
      changes: draft.changes,
      ipAddress: draft.ipAddress,
      userAgent: draft.userAgent,
      traceId: draft.traceId,
      at,
    };

    return {
      ...unsigned,
      previousHash,
      hash: computeAuditHash(previousHash, toHashable(unsigned)),
    };
  }
}

/** Everything about an event except its chain position and instant. */
interface AuditDraft {
  readonly actor: AuditActor;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly changes: AuditChange[];
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly traceId: string;
}

/** The two fields of the tail an append needs. */
type ChainTail = { readonly sequence: number; readonly hash: string } | null;
