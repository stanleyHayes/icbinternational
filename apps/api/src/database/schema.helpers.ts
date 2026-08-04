import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type SchemaOptions } from 'mongoose';

/**
 * Shared Mongoose schema conventions.
 *
 * Every collection stores a public prefixed id alongside the Mongo `_id`, timestamps in
 * UTC, and an optimistic-concurrency version. Centralising the options means a new
 * collection cannot accidentally opt out of any of them.
 */

/** Base options applied to every schema. */
export const BASE_SCHEMA_OPTIONS: SchemaOptions = {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: '__v',
  minimize: false,
  optimisticConcurrency: true,
  /**
   * Every write waits for a majority.
   *
   * This is a correctness requirement, not a durability preference. Transactions in this
   * application run at `readConcern: 'snapshot'`, which reads the latest
   * *majority-committed* snapshot and nothing newer. A document acknowledged at the
   * default `w: 1` is therefore invisible to the very next transaction until it
   * replicates — so a record written outside a transaction and read inside one can simply
   * not be there.
   *
   * It was found on the transfer path: a quote is written non-transactionally and then
   * executed inside a transaction moments later. On an idle machine the gap is
   * microseconds. Under load the majority-commit point lags, the transaction's snapshot
   * predates the quote, and the customer is told `QUOTE_NOT_FOUND` for a quote they were
   * handed a second earlier. The same shape applies to any collection read this way, so
   * the default belongs here rather than on the one schema that exposed it.
   */
  writeConcern: { w: 'majority' },
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false },
};

/** Embedded sub-document options — no timestamps, no separate `_id`. */
export const EMBEDDED_SCHEMA_OPTIONS: SchemaOptions = { _id: false, versionKey: false };

/**
 * Money as stored in MongoDB: minor units as a string plus a currency code.
 *
 * A string rather than a BSON number because minor-unit amounts can exceed 2^53 in
 * low-denomination currencies, and rather than `Decimal128` because the ledger never
 * needs fractional minor units and string comparison is exact.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class StoredMoneySchemaClass {
  @Prop({ required: true, type: String, match: /^-?\d+$/ })
  amount!: string;

  @Prop({ required: true, type: String, length: 3 })
  currency!: string;
}

export const StoredMoneySchema = SchemaFactory.createForClass(StoredMoneySchemaClass);

/** Reusable prop definition for a required money field. */
export const moneyProp = { type: StoredMoneySchema, required: true } as const;

/** Reusable prop definition for an optional money field. */
export const optionalMoneyProp = {
  type: StoredMoneySchema,
  required: false,
  default: null,
} as const;

/** Reusable prop definition for the public prefixed identifier. */
export const publicIdProp = {
  type: String,
  required: true,
  unique: true,
  immutable: true,
  index: true,
} as const;
