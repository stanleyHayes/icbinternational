import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { AccountType } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import {
  FeeScheduleEntrySchema,
  InterestTierSchema,
  ProductLimitsSchema,
  type FeeScheduleEntrySchemaClass,
  type InterestTierSchemaClass,
  type ProductLimitsSchemaClass,
} from './product-pricing.schema.js';
import { PRODUCTS_COLLECTION } from './product.constants.js';

/**
 * A single, immutable version of a product.
 *
 * Repricing inserts a new version; it never edits an existing one. That is what lets an
 * account opened in 2024 keep the terms it was actually sold, and lets a statement issued
 * today explain a fee charged eighteen months ago under pricing nobody offers any more.
 *
 * There is deliberately no `effectiveTo` write on the predecessor when a successor is
 * published. Resolution picks the version with the greatest `effectiveFrom` not after the
 * date being asked about, so a new version supersedes the old one without touching it.
 * `effectiveTo` is reserved for a version that stops applying with no successor at all.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: PRODUCTS_COLLECTION })
export class ProductSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  /** Stable across versions — `EVERYDAY_CURRENT` is one product with many versions. */
  @Prop({ required: true, type: String, index: true })
  code!: string;

  /** Monotonic per code, starting at 1. Never reused, never renumbered. */
  @Prop({ required: true, type: Number })
  version!: number;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  tagline!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: true, type: String, enum: Object.values(AccountType) })
  accountType!: AccountType;

  /** Currencies an account on this product may be denominated in. */
  @Prop({ required: true, type: [String] })
  currencies!: string[];

  /** Lowest KYC tier eligible to open the product, 0–3. */
  @Prop({ required: true, type: Number })
  minKycTier!: number;

  @Prop(moneyProp)
  minOpeningBalance!: StoredMoney;

  /** Balance below which the product's minimum-balance terms bite. */
  @Prop(moneyProp)
  minBalance!: StoredMoney;

  @Prop(moneyProp)
  monthlyFee!: StoredMoney;

  /** Credit interest bands, ordered by `fromAmount` ascending. */
  @Prop({ required: true, type: [InterestTierSchema], default: [] })
  creditInterestTiers!: InterestTierSchemaClass[];

  /** Arranged overdraft rate. Null on products that cannot go overdrawn. */
  @Prop({ type: Number, default: null })
  debitInterestBps!: number | null;

  @Prop({ required: true, type: [FeeScheduleEntrySchema], default: [] })
  fees!: FeeScheduleEntrySchemaClass[];

  @Prop({ required: true, type: ProductLimitsSchema })
  limits!: ProductLimitsSchemaClass;

  /** Marketing bullet points, shown on the public catalogue. */
  @Prop({ required: true, type: [String], default: [] })
  features!: string[];

  /** Whether the version is open to new applications. Existing accounts are unaffected. */
  @Prop({ required: true, type: Boolean, default: true })
  active!: boolean;

  /**
   * `YYYY-MM-DD`, stored as a string rather than a `Date`.
   *
   * A product takes effect on a calendar date, not at an instant, and a `Date` would
   * force every comparison to pick a timezone in which midnight happens. ISO date strings
   * compare correctly with `$lte`/`$gt` because the format sorts lexicographically.
   */
  @Prop({ required: true, type: String })
  effectiveFrom!: string;

  /** Exclusive. Set only when a version is withdrawn with nothing replacing it. */
  @Prop({ type: String, default: null })
  effectiveTo!: string | null;
}

export type ProductDocument = HydratedDocument<ProductSchemaClass>;

export const ProductSchema = SchemaFactory.createForClass(ProductSchemaClass);

// A product version is identified by its code and number, and inserting a duplicate is
// the exact failure mode a retried seed or a double-clicked publish would produce.
ProductSchema.index({ code: 1, version: 1 }, { unique: true, name: 'code_1_version_1' });

// Resolution always asks "which version of this code applied on this date?", which this
// index answers without a scan; `version` descending breaks a same-day tie deterministically.
ProductSchema.index({ code: 1, effectiveFrom: -1, version: -1 }, { name: 'code_effective_desc' });
