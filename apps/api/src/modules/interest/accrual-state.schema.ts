import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp } from '../../database/schema.helpers.js';

import { ACCRUAL_STATE_COLLECTION } from './interest.constants.js';

/**
 * One account's interest accrual: the exact, unrounded interest it has earned and not
 * yet been paid.
 *
 * `numerator` is the heart of it. Interest accrues daily as an exact rational —
 * `numerator / (10_000 × 365)` minor units on the house actual/365 convention — and is
 * rounded to whole minor units only when a month is capitalised, the sub-minor remainder
 * staying behind to be earned into the next period. It is stored as a string for the
 * same reason money is: a year of accrual on a large balance overflows a BSON double's
 * exact integer range, and string comparison is exact.
 *
 * The document is keyed by `accountId` alone — the state is 1:1 with the account and
 * never leaves the service, so it carries no public id of its own. The two date stamps
 * are what make rerunning a job safe: `lastAccruedOn` turns "accrue today twice" into a
 * no-op, and `lastCapitalisedPeriod` does the same for a repeated month-end.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ACCRUAL_STATE_COLLECTION, id: false })
export class AccrualStateSchemaClass {
  /** The account this state belongs to. Unique: one accumulator per account. */
  @Prop({ type: String, required: true, immutable: true, unique: true, index: true })
  accountId!: string;

  /** ISO 4217, copied from the account so the numerator is never read currency-blind. */
  @Prop({ type: String, required: true, immutable: true, length: 3 })
  currency!: string;

  /** Unrounded accrual over the day-count denominator, as a decimal string. */
  @Prop({ type: String, required: true, match: /^\d+$/ })
  numerator!: string;

  /** Last business date accrued (`YYYY-MM-DD`). Null until the first accrual. */
  @Prop({ type: String, default: null })
  lastAccruedOn!: string | null;

  /** Last period capitalised (`YYYY-MM`). Null until the first payout. */
  @Prop({ type: String, default: null })
  lastCapitalisedPeriod!: string | null;

  /** Running total paid out — what statements and interest certificates report. */
  @Prop(moneyProp)
  capitalisedToDate!: StoredMoney;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AccrualStateDocument = HydratedDocument<AccrualStateSchemaClass>;

export const AccrualStateSchema = SchemaFactory.createForClass(AccrualStateSchemaClass);
