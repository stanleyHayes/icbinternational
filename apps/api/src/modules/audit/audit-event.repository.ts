import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { AuditEventDocument, type AuditEventDoc } from './audit-event.schema.js';
import { DUPLICATE_KEY_ERROR_CODE } from './audit.constants.js';
import { type AuditActorType, type AuditChange } from './audit.types.js';

/**
 * The only way into `audit_events`.
 *
 * Note what is absent: there is no `update`, no `delete`, no `deleteMany`. That is the
 * whole design. This class deliberately does **not** extend `BaseRepository`, because
 * inheriting `updateById` and `deleteById` would hand every caller the two operations the
 * collection exists to forbid. Append-only has to be a property of the type, not a note
 * in a comment somebody might not read.
 */
@Injectable()
export class AuditEventRepository {
  constructor(
    @InjectModel(AuditEventDocument.name)
    private readonly model: Model<AuditEventDocument>,
  ) {}

  /**
   * Inserts one event.
   *
   * Returns `null` — rather than throwing — when the unique index on `sequence` rejects
   * the write, because losing that race is expected under concurrency and the caller's
   * correct response is to re-read the tail and try again, not to fail the operation.
   */
  async append(event: NewAuditEvent): Promise<AuditEventDoc | null> {
    try {
      return await this.model.create(event);
    } catch (error) {
      if (isDuplicateKey(error)) return null;
      throw error;
    }
  }

  /** The current tail of the chain, or `null` when no event has ever been written. */
  async findLatest(): Promise<AuditEventDoc | null> {
    return this.model.findOne().sort({ sequence: -1 }).exec();
  }

  /** A contiguous slice of the chain, ascending. Used by the verifier's batched walk. */
  async findFromSequence(sequence: number, limit: number): Promise<AuditEventDoc[]> {
    return this.model
      .find({ sequence: { $gte: sequence } })
      .sort({ sequence: 1 })
      .limit(limit)
      .exec();
  }

  /** Everything recorded about one entity, most recent first. */
  async findForEntity(entity: string, entityId: string, limit: number): Promise<AuditEventDoc[]> {
    return this.model.find({ entity, entityId }).sort({ sequence: -1 }).limit(limit).exec();
  }

  /**
   * Cursor-paginated query for the admin audit log.
   *
   * Cursor is a sequence number — events are naturally ordered that way and the number
   * does not change under concurrent inserts, so it is stable.
   */
  async query(params: AuditEventQuery): Promise<AuditEventDoc[]> {
    const filter: Record<string, unknown> = {};

    if (params.cursor) {
      filter['sequence'] = { $lt: Number(params.cursor) };
    }
    if (params.actorId) filter['actorId'] = params.actorId;
    if (params.entity) filter['entity'] = params.entity;
    if (params.entityId) filter['entityId'] = params.entityId;
    if (params.action) filter['action'] = { $regex: params.action, $options: 'i' };
    if (params.from || params.to) {
      filter['at'] = {
        ...(params.from ? { $gte: new Date(params.from) } : {}),
        ...(params.to ? { $lte: new Date(params.to) } : {}),
      };
    }

    return this.model
      .find(filter)
      .sort({ sequence: -1 })
      .limit(params.limit)
      .exec();
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments().exec();
  }
}

export interface AuditEventQuery {
  cursor?: string;
  limit: number;
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/** Fields supplied on insert. `sequence`, `previousHash` and `hash` are computed upstream. */
export interface NewAuditEvent {
  id: string;
  sequence: number;
  actorType: AuditActorType;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  changes: AuditChange[];
  ipAddress: string | null;
  userAgent: string | null;
  traceId: string;
  previousHash: string;
  hash: string;
  at: Date;
}

/** MongoDB reports every unique-index violation as error 11000, whichever index it was. */
export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}
