import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp } from '../../database/schema.helpers.js';

import { USAGE_COUNTERS_COLLECTION } from './product.constants.js';

/**
 * How much of an allowance an account has consumed in one window.
 *
 * Counters live in their own collection rather than as fields on the account for three
 * reasons: they are written far more often than the account document and would otherwise
 * make every debit contend on it; they expire, and a TTL index cannot expire a subfield;
 * and a counter that has rolled over is simply absent, which is the correct default of
 * zero without a migration to seed it.
 *
 * `total` and `count` are incremented with `$inc` inside the same transaction as the
 * posting they belong to. If the posting rolls back so does the counter, which is the
 * only way the two can be guaranteed to agree.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: USAGE_COUNTERS_COLLECTION })
export class UsageCounterSchemaClass {
  @Prop({ required: true, type: String })
  accountId!: string;

  /** What is being counted, e.g. `cardSpend` or `fee:ATM_DOMESTIC`. */
  @Prop({ required: true, type: String })
  scope!: string;

  /** `YYYY-MM-DD` or `YYYY-MM` in the customer's own timezone. */
  @Prop({ required: true, type: String })
  periodKey!: string;

  /** Running total. Minor units as a string, so `$inc` is never used on it directly. */
  @Prop(moneyProp)
  total!: StoredMoney;

  @Prop({ required: true, type: Number, default: 0 })
  count!: number;

  /** The instant the window rolls and the allowance returns to full. */
  @Prop({ required: true, type: Date })
  resetsAt!: Date;

  /** Reset instant plus the support retention grace. Drives the TTL index. */
  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export type UsageCounterDocument = HydratedDocument<UsageCounterSchemaClass>;

export const UsageCounterSchema = SchemaFactory.createForClass(UsageCounterSchemaClass);

// The natural key. Unique because two counter documents for the same window would each
// hold half the spend, and the customer would get twice their limit.
UsageCounterSchema.index(
  { accountId: 1, scope: 1, periodKey: 1 },
  { unique: true, name: 'account_scope_period' },
);

// Expired counters are noise. Mongo deletes them once `expiresAt` has passed.
UsageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'counter_ttl' });
