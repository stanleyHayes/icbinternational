import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { CHARGEABLE_STATUSES, ChargeableAccountSchemaClass } from './chargeable-account.schema.js';
import { CHARGEABLE_ACCOUNT_MODEL } from './fees.constants.js';

/** The slice of an account the maintenance sweep prices from. */
export type ChargeableAccount = Pick<
  ChargeableAccountSchemaClass,
  'id' | 'status' | 'currency' | 'productCode' | 'productVersion' | 'openedAt' | 'closedAt'
>;

/**
 * Cursored scans of every chargeable account, for the monthly maintenance sweep.
 *
 * The cursor is the public id: ULIDs sort by creation time, so `id > afterId` gives a
 * stable forward walk that cannot skip or repeat an account when a concurrent opening
 * inserts one mid-sweep — a newcomer simply sorts behind the cursor and waits for the
 * next run, which is correct because it owes nothing for the period being charged.
 */
@Injectable()
export class ChargeableAccountReader {
  constructor(
    @InjectModel(CHARGEABLE_ACCOUNT_MODEL)
    private readonly model: Model<ChargeableAccountSchemaClass>,
  ) {}

  /** Up to `limit` chargeable accounts after `afterId` (exclusive), oldest first. */
  async listChargeable(afterId: string | null, limit: number): Promise<ChargeableAccount[]> {
    const documents = await this.model
      .find({
        status: { $in: [...CHARGEABLE_STATUSES] },
        ...(afterId === null ? {} : { id: { $gt: afterId } }),
      })
      .sort({ id: 1 })
      .limit(limit)
      .lean()
      .exec();

    return documents.map((document) => ({ ...document }));
  }
}
