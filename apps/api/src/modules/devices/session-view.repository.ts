import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';
import { Session, SessionSchema, type SessionDocument } from '../auth/schemas/session.schema.js';

/**
 * Model name for this module's handle on the `sessions` collection.
 *
 * A model name can only be registered once per connection, and the auth module owns the
 * canonical `Session` model. The schema still points at `collection: 'sessions'`, so this
 * second name reads the same rows — the same pattern the GL module uses over
 * `chart_of_accounts`.
 */
export const SESSION_VIEW_MODEL = 'SessionView';

/** Registers the read-only session model for `MongooseModule.forFeature`. */
export const SESSION_VIEW_FEATURE = { name: SESSION_VIEW_MODEL, schema: SessionSchema };

/** A session row is live while it is neither spent nor revoked. */
const LIVE: Record<string, null> = { rotatedAt: null, revokedAt: null };

/**
 * Read-only persistence for the `sessions` collection, for the security screens.
 *
 * Writes — rotation, revocation, reuse handling — stay with the auth module's canonical
 * `SessionRepository` and `SessionService`. This handle exists because listing "your
 * active sessions" and finding the sessions a blocked device is running are reads this
 * module owns, and duplicating the write side is how the two drifted apart last time.
 */
@Injectable()
export class SessionViewRepository extends BaseRepository<Session> {
  constructor(@InjectModel(SESSION_VIEW_MODEL) model: Model<Session>) {
    super(model);
  }

  /** The customer's live sessions, newest first — one row per active login. */
  async findLiveForUser(userId: string): Promise<SessionDocument[]> {
    return this.find({ userId, ...LIVE } as QueryFilter<Session>, {
      sort: { createdAt: -1 },
    }) as Promise<SessionDocument[]>;
  }

  /** One live session by public id — the remote-revoke ownership check reads through this. */
  async findLiveById(id: string): Promise<SessionDocument | null> {
    return this.findOne({ id, ...LIVE } as QueryFilter<Session>);
  }

  /** Live sessions running on one device, revoked wholesale when the device is removed. */
  async findLiveForDevice(userId: string, deviceId: string): Promise<SessionDocument[]> {
    return this.find({ userId, deviceId, ...LIVE } as QueryFilter<Session>);
  }
}
