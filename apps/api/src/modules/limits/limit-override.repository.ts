import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { type LimitOverride } from './limit-override.js';
import { toDomainOverride } from './limit-override.mapper.js';
import { LimitOverrideSchemaClass, type LimitOverrideDocument } from './limit-override.schema.js';

/**
 * Persistence for limit overrides.
 *
 * Reads the engine makes on every check go through {@link findLiveFor}, which hits the
 * `live_overrides` index. Revocation is a conditional single-document update — it only
 * succeeds while `revokedAt` is still null — so two admins revoking the same grant
 * produce one revocation and one honest "already revoked", never a double write.
 */
@Injectable()
export class LimitOverrideRepository extends BaseRepository<LimitOverrideSchemaClass> {
  constructor(
    @InjectModel(LimitOverrideSchemaClass.name)
    model: Model<LimitOverrideSchemaClass>,
  ) {
    super(model);
  }

  /** Live overrides for one account and scope: unexpired, unrevoked. */
  async findLiveFor(
    accountId: string,
    scope: string,
    now: Date,
    session?: ClientSession,
  ): Promise<LimitOverride[]> {
    const documents = await this.find(
      { accountId, scope, revokedAt: null, expiresAt: { $gt: now } },
      { session },
    );
    return documents.map(toDomainOverride);
  }

  /** Every override an account has ever had, newest first — the grant history. */
  async listForAccount(accountId: string): Promise<LimitOverrideDocument[]> {
    return this.find({ accountId }, { sort: { createdAt: -1 } });
  }

  /** Persists a new grant. The service owns validation and id minting. */
  async insert(override: LimitOverride, session?: ClientSession): Promise<LimitOverrideDocument> {
    return this.create(toRecord(override), session);
  }

  /**
   * Marks the grant ended at `at`, or returns null when it does not exist or another
   * revocation already landed. The filter is the optimistic lock.
   */
  async revoke(id: string, at: Date): Promise<LimitOverrideDocument | null> {
    return this.updateOne({ id, revokedAt: null }, { $set: { revokedAt: at } });
  }
}

/** Domain → the record shape the collection stores. */
function toRecord(override: LimitOverride): Record<string, unknown> {
  const money = (amount: string | null) =>
    amount === null ? null : { amount, currency: override.currency };

  return {
    id: override.id,
    accountId: override.accountId,
    scope: override.scope,
    channel: override.channel,
    currency: override.currency,
    perTransaction: money(override.perTransaction),
    daily: money(override.daily),
    monthly: money(override.monthly),
    dailyCount: override.dailyCount,
    reason: override.reason,
    expiresAt: override.expiresAt,
    revokedAt: null,
    createdBy: override.createdBy,
  };
}
