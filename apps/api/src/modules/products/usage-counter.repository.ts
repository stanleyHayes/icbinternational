import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';

import { Money, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../common/money/money.codec.js';
import { BaseRepository } from '../../database/base.repository.js';

import { UsageCounterSchemaClass } from './usage-counter.schema.js';

/** Identifies one counter window. */
export interface CounterKey {
  readonly accountId: string;
  readonly scope: string;
  readonly periodKey: string;
}

/** What an account has already consumed in a window. Absent counters read as zero. */
export interface CounterSnapshot {
  readonly total: Money;
  readonly count: number;
}

@Injectable()
export class UsageCounterRepository extends BaseRepository<UsageCounterSchemaClass> {
  constructor(
    @InjectModel(UsageCounterSchemaClass.name)
    model: Model<UsageCounterSchemaClass>,
  ) {
    super(model);
  }

  /** Reads several windows of one account in a single round trip. */
  async findWindows(
    accountId: string,
    scope: string,
    periodKeys: readonly string[],
    session?: ClientSession,
  ): Promise<Map<string, CounterSnapshot>> {
    const documents = await this.find(
      { accountId, scope, periodKey: { $in: [...periodKeys] } },
      { session },
    );

    return new Map(
      documents.map((document) => [
        document.periodKey,
        { total: fromStored(document.total), count: document.count },
      ]),
    );
  }

  /** Zero-valued snapshot, so a caller never has to special-case a missing counter. */
  static empty(currency: CurrencyCode): CounterSnapshot {
    return { total: Money.zero(currency), count: 0 };
  }

  /**
   * Adds `amount` and one movement to a window, creating it if this is the first.
   *
   * Written as a single upserting aggregation-pipeline update rather than read-then-write.
   * Two payments racing on the first spend of the day would both find no counter, and the
   * loser of a read-then-write would overwrite the winner's total. The pipeline's `$add`
   * runs on the server against the document's current value, so no increment is lost.
   *
   * The upsert has one failure mode left, and it is not the arithmetic. When the counter
   * does not yet exist, concurrent upserts all try to *insert*; the unique index on
   * `{accountId, scope, periodKey}` lets one through and raises `E11000` on the rest. That
   * is MongoDB working correctly, and the documented answer is to retry — the second
   * attempt finds the row the winner created and takes the increment path. Without the
   * retry, the day's first two simultaneous payments would fail a limits check that should
   * simply have counted them both.
   *
   * One retry is enough: it can only be reached when the document was absent, and after
   * the winner's insert it is present for good. There is no second race to lose.
   *
   * The running total is a decimal string, so the addition happens in BSON `long`. A
   * 64-bit signed integer holds ~9.2×10^18 minor units — nine quintillion pence — which no
   * single account's daily turnover will approach.
   */
  async accumulate(
    key: CounterKey,
    amount: Money,
    window: { resetsAt: Date; expiresAt: Date },
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.upsertCounter(key, amount, window, session);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      await this.upsertCounter(key, amount, window, session);
    }
  }

  private async upsertCounter(
    key: CounterKey,
    amount: Money,
    window: { resetsAt: Date; expiresAt: Date },
    session?: ClientSession,
  ): Promise<void> {
    await this.collection
      .updateOne(key, buildAccumulatePipeline(amount, window), {
        upsert: true,
        // The update is an aggregation pipeline, not a replacement document: Mongoose
        // treats an array update as an error unless the pipeline is declared.
        updatePipeline: true,
        session: session ?? undefined,
      })
      .exec();
  }
}

/** MongoDB's duplicate-key code, raised here only by a lost race to create a counter. */
const DUPLICATE_KEY = 11_000;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

/** The `$set` stage that both creates and increments a counter. */
function buildAccumulatePipeline(
  amount: Money,
  window: { resetsAt: Date; expiresAt: Date },
): Record<string, unknown>[] {
  const addend = amount.amount.toString();

  return [
    {
      $set: {
        total: {
          amount: {
            $toString: {
              $add: [{ $toLong: { $ifNull: ['$total.amount', ZERO_STRING] } }, { $toLong: addend }],
            },
          },
          currency: amount.currency,
        },
        count: { $add: [{ $ifNull: ['$count', 0] }, 1] },
        resetsAt: window.resetsAt,
        expiresAt: window.expiresAt,
      },
    },
  ];
}

const ZERO_STRING = '0';
