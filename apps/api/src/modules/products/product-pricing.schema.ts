import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { FeeKind } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  EMBEDDED_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
} from '../../database/schema.helpers.js';

/**
 * The embedded pricing documents of a product: fees, interest tiers and limits.
 *
 * They are embedded rather than referenced because they are only ever read as part of the
 * product version that owns them, and because embedding is what makes a version immutable
 * in practice — there is no separate row someone could reprice behind the version's back.
 */

@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class FeeScheduleEntrySchemaClass {
  @Prop({ required: true, type: String, enum: Object.values(FeeKind) })
  kind!: FeeKind;

  @Prop({ required: true, type: String })
  label!: string;

  /** Flat component. Null when the fee is purely proportional. */
  @Prop(optionalMoneyProp)
  flatAmount!: StoredMoney | null;

  /** Proportional component in basis points. Null when the fee is purely flat. */
  @Prop({ type: Number, default: null })
  rateBps!: number | null;

  /** Floor applied after the flat and proportional components are summed. */
  @Prop(optionalMoneyProp)
  minAmount!: StoredMoney | null;

  /** Cap applied after the floor. A cap below the floor is a configuration error. */
  @Prop(optionalMoneyProp)
  maxAmount!: StoredMoney | null;

  @Prop({ required: true, type: Number, default: 0 })
  freeAllowancePerMonth!: number;

  /** Customer tiers this fee is waived for, e.g. `PREMIER`. */
  @Prop({ required: true, type: [String], default: [] })
  waivedForTiers!: string[];
}

export const FeeScheduleEntrySchema = SchemaFactory.createForClass(FeeScheduleEntrySchemaClass);

@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class InterestTierSchemaClass {
  /** Inclusive lower bound of the balance band. */
  @Prop(moneyProp)
  fromAmount!: StoredMoney;

  /** Exclusive upper bound. Null on the top band, which is unbounded. */
  @Prop(optionalMoneyProp)
  toAmount!: StoredMoney | null;

  @Prop({ required: true, type: Number })
  annualRateBps!: number;
}

export const InterestTierSchema = SchemaFactory.createForClass(InterestTierSchemaClass);

@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class LimitMatrixSchemaClass {
  /** Largest single movement. Null means the per-transaction dimension is uncapped. */
  @Prop(optionalMoneyProp)
  perTransaction!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  daily!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  monthly!: StoredMoney | null;

  /** Maximum number of movements in a local calendar day. */
  @Prop({ type: Number, default: null })
  dailyCount!: number | null;
}

export const LimitMatrixSchema = SchemaFactory.createForClass(LimitMatrixSchemaClass);

const limitMatrixProp = { type: LimitMatrixSchema, required: true } as const;

/**
 * The five limit dimensions a product caps.
 *
 * Modelled as named fields rather than a map so that adding a sixth channel is a
 * deliberate, reviewable schema change and not a typo in a string key that silently
 * resolves to "no limit".
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class ProductLimitsSchemaClass {
  @Prop(limitMatrixProp)
  internalTransfer!: LimitMatrixSchemaClass;

  @Prop(limitMatrixProp)
  domesticTransfer!: LimitMatrixSchemaClass;

  @Prop(limitMatrixProp)
  internationalTransfer!: LimitMatrixSchemaClass;

  @Prop(limitMatrixProp)
  cardSpend!: LimitMatrixSchemaClass;

  @Prop(limitMatrixProp)
  atmWithdrawal!: LimitMatrixSchemaClass;
}

export const ProductLimitsSchema = SchemaFactory.createForClass(ProductLimitsSchemaClass);
