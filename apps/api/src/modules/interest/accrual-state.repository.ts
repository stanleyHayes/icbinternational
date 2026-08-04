import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { toStored } from '../../common/money/money.codec.js';

import { type AccrualStateSchemaClass } from './accrual-state.schema.js';
import {
  AccrualStateStore,
  type AccrualStateRecord,
  type ApplyAccrualInput,
  type ApplyCapitalisationInput,
} from './accrual-state.store.js';
import { ACCRUAL_STATE_MODEL } from './interest.constants.js';

const DUPLICATE_KEY_CODE = 11_000;

/**
 * MongoDB-backed accrual-state persistence.
 *
 * Every write is a conditional `findOneAndUpdate` — never `document.save()` — with the
 * condition carrying the stamps and numerator the caller read. Two writers cannot lose
 * each other's update: the loser's condition no longer matches, it reports `false`, and
 * the service skips rather than double-accrues.
 *
 * First accrual is an upsert guarded by the unique index on `accountId`: two processes
 * accruing a brand-new account at the same instant cannot both insert, and the loser
 * turns its duplicate-key error into the same `false` any other lost race reports.
 */
@Injectable()
export class AccrualStateRepository extends AccrualStateStore {
  constructor(
    @InjectModel(ACCRUAL_STATE_MODEL) private readonly model: Model<AccrualStateSchemaClass>,
  ) {
    super();
  }

  override async findByAccountId(
    accountId: string,
    session?: ClientSession,
  ): Promise<AccrualStateRecord | null> {
    const document = await this.model
      .findOne({ accountId })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document.toObject()) : null;
  }

  override async applyAccrual(input: ApplyAccrualInput): Promise<boolean> {
    const filter = stateFilter({
      accountId: input.accountId,
      lastAccruedOn: input.expectedLastAccruedOn,
      numerator: input.expectedNumerator,
    });

    try {
      const result = await this.model
        .updateOne(
          filter,
          {
            $set: {
              numerator: input.numerator.toString(),
              lastAccruedOn: input.accruedOn,
            },
            $setOnInsert: {
              accountId: input.accountId,
              currency: input.currency,
              lastCapitalisedPeriod: null,
              capitalisedToDate: { amount: '0', currency: input.currency },
            },
          },
          { upsert: true, session: input.session ?? undefined },
        )
        .exec();

      return result.matchedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
      // The upsert lost the race to insert the account's first state — a lost race is
      // the same outcome as any other conditional write that stopped matching.
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  override async applyCapitalisation(input: ApplyCapitalisationInput): Promise<boolean> {
    const filter = stateFilter({
      accountId: input.accountId,
      lastCapitalisedPeriod: input.expectedLastCapitalisedPeriod,
      numerator: input.expectedNumerator,
    });

    const result = await this.model
      .updateOne(
        filter,
        {
          $set: {
            numerator: input.numerator.toString(),
            lastCapitalisedPeriod: input.period,
            capitalisedToDate: toStored(input.capitalisedToDate),
          },
        },
        { session: input.session ?? undefined },
      )
      .exec();

    return result.matchedCount > 0;
  }
}

/** The read-state condition every conditional write carries. */
function stateFilter(input: {
  accountId: string;
  lastAccruedOn?: string | null;
  lastCapitalisedPeriod?: string | null;
  numerator: bigint;
}): QueryFilter<AccrualStateSchemaClass> {
  return {
    accountId: input.accountId,
    numerator: input.numerator.toString(),
    ...(input.lastAccruedOn !== undefined ? { lastAccruedOn: input.lastAccruedOn } : {}),
    ...(input.lastCapitalisedPeriod !== undefined
      ? { lastCapitalisedPeriod: input.lastCapitalisedPeriod }
      : {}),
  };
}

/** Narrows a driver error to a unique-index violation on the upsert path. */
function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}

/** Hydrated shape to plain record. The record is what leaves the repository. */
function toRecord(plain: AccrualStateSchemaClass): AccrualStateRecord {
  return {
    accountId: plain.accountId,
    currency: plain.currency,
    numerator: BigInt(plain.numerator),
    lastAccruedOn: plain.lastAccruedOn,
    lastCapitalisedPeriod: plain.lastCapitalisedPeriod,
    capitalisedToDate: { ...plain.capitalisedToDate },
  };
}
