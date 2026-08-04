import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { AccountStatus } from '@reliance/contracts';

import { type AccountSchemaClass } from '../accounts/index.js';

import {
  InterestAccountSource,
  type AccrualPageQuery,
  type InterestBearingAccount,
} from './interest-account.source.js';
import { INTEREST_ACCOUNT_VIEW_MODEL } from './interest.constants.js';

/** Account states in which credit interest keeps accruing. */
const ACCRUING_STATUSES: readonly AccountStatus[] = [AccountStatus.ACTIVE, AccountStatus.DORMANT];

/** Only the fields the engine reads — see the port for why the projection is narrow. */
const PROJECTION = {
  id: 1,
  currency: 1,
  productCode: 1,
  productVersion: 1,
  ledgerBalance: 1,
} as const;

/**
 * Read-only enumeration over the accounts collection.
 *
 * The accounts lane owns every write to this collection; this source only ever reads it,
 * the way the GL lane reads the ledger's chart of accounts. Registration reuses the
 * lane's own exported schema under a view-model name, so there is exactly one definition
 * of what an account document is — a second schema drifting from the first is how two
 * modules end up disagreeing about where the balance lives.
 *
 * The page predicate leans on the pinned `interestRateBps`: opening pins the lowest
 * band's rate for tiered products and null for products that pay nothing, so "not null"
 * is precisely "sold on a product with credit tiers".
 */
@Injectable()
export class MongoInterestAccountSource extends InterestAccountSource {
  constructor(
    @InjectModel(INTEREST_ACCOUNT_VIEW_MODEL)
    private readonly model: Model<AccountSchemaClass>,
  ) {
    super();
  }

  override async listInterestBearing(query: AccrualPageQuery): Promise<InterestBearingAccount[]> {
    const filter: QueryFilter<AccountSchemaClass> = {
      status: { $in: [...ACCRUING_STATUSES] },
      interestRateBps: { $ne: null },
      ...(query.afterId ? { id: { $gt: query.afterId } } : {}),
    };

    const documents = await this.model
      .find(filter, PROJECTION)
      .sort({ id: 1 })
      .limit(query.limit)
      .exec();

    return documents.map((document) => {
      const plain = document.toObject<AccountSchemaClass>();
      return {
        id: plain.id,
        currency: plain.currency,
        productCode: plain.productCode,
        productVersion: plain.productVersion,
        ledgerBalance: { ...plain.ledgerBalance },
      };
    });
  }
}
