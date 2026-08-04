import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { AuthTokenKind } from './auth.constants.js';
import { AuthToken, type AuthTokenDocument } from './schemas/auth-token.schema.js';

/** Persistence for the `auth_tokens` collection — single-use emailed secrets. */
@Injectable()
export class AuthTokenRepository extends BaseRepository<AuthToken> {
  constructor(@InjectModel(AuthToken.name) model: Model<AuthToken>) {
    super(model);
  }

  /**
   * Finds a live token and spends it in one atomic step.
   *
   * Redeem-by-update rather than read-then-mark: two clicks on the same link race, and
   * only the first may succeed. A null return means the link was unknown, expired, or
   * already spent — the caller does not distinguish, because an attacker probing which of
   * the three it was learns something each time.
   */
  async consume(
    tokenHash: string,
    kind: AuthTokenKind,
    now: Date,
  ): Promise<AuthTokenDocument | null> {
    return this.updateOne(
      { tokenHash, kind, consumedAt: null, expiresAt: { $gt: now } } as QueryFilter<AuthToken>,
      { $set: { consumedAt: now } },
    );
  }

  /**
   * Invalidates every outstanding token of a kind.
   *
   * Called when a fresh link is issued — one live reset link per customer at a time — and
   * after a successful redemption, so a mailbox full of old links does not stay armed.
   */
  async consumeAllForUser(userId: string, kind: AuthTokenKind, at: Date): Promise<number> {
    return this.updateMany({ userId, kind, consumedAt: null } as QueryFilter<AuthToken>, {
      $set: { consumedAt: at },
    });
  }
}
