import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { SessionRevocation } from './auth.constants.js';
import { Session, type SessionDocument } from './schemas/session.schema.js';

/**
 * Persistence for the `sessions` collection — one row per refresh-token instance.
 *
 * The two writes that matter here are atomic by construction: claiming a row for rotation
 * and consuming a session are single `findOneAndUpdate`/`updateMany` calls, so a race
 * between two refreshes of the same token has exactly one winner, and the loser can be
 * treated as the reuse it may be.
 */
@Injectable()
export class SessionRepository extends BaseRepository<Session> {
  constructor(@InjectModel(Session.name) model: Model<Session>) {
    super(model);
  }

  /** Looks up the row backing a presented refresh token. */
  async findByTokenHash(refreshTokenHash: string): Promise<SessionDocument | null> {
    return this.findOne({ refreshTokenHash } as QueryFilter<Session>);
  }

  /**
   * Atomically marks a live row as spent and returns it.
   *
   * The filter, not a preceding read, carries the "still live" condition: two concurrent
   * refreshes both pass a read-then-check, but only the first wins this update. A null
   * return means the row was already rotated or revoked by someone else.
   */
  async claimForRotation(refreshTokenHash: string, at: Date): Promise<SessionDocument | null> {
    return this.updateOne(
      { refreshTokenHash, rotatedAt: null, revokedAt: null } as QueryFilter<Session>,
      { $set: { rotatedAt: at, lastSeenAt: at } },
    );
  }

  /** Names the row minted in this one's place, completing the chain for forensics. */
  async markReplaced(id: string, successorId: string): Promise<void> {
    await this.updateById(id, { $set: { replacedBySessionId: successorId } });
  }

  /** Revokes every live row in a login family. Returns how many rows were ended. */
  async revokeFamily(family: string, reason: SessionRevocation, at: Date): Promise<number> {
    return this.revokeWhere({ family } as QueryFilter<Session>, reason, at);
  }

  /** Revokes one row — logout and remote revocation of a single session. */
  async revokeSession(id: string, reason: SessionRevocation, at: Date): Promise<number> {
    return this.revokeWhere({ id } as QueryFilter<Session>, reason, at);
  }

  /**
   * Revokes every live row a user holds, optionally sparing one.
   *
   * Password changes spare the session that proved the current password; a reset from
   * email spares nothing, because the reset itself is proof of a compromised session set.
   */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocation,
    at: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    const filter = { userId, ...(exceptSessionId ? { id: { $ne: exceptSessionId } } : {}) };
    return this.revokeWhere(filter as QueryFilter<Session>, reason, at);
  }

  private async revokeWhere(
    filter: QueryFilter<Session>,
    reason: SessionRevocation,
    at: Date,
  ): Promise<number> {
    return this.updateMany(
      { ...filter, revokedAt: null },
      { $set: { revokedAt: at, revokedReason: reason } },
    );
  }
}
