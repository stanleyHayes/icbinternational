import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BillerCategory } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp } from '../../database/schema.helpers.js';

import { BILLER_COLLECTION } from './bill-pay.constants.js';

/**
 * The biller directory, as this module reads it.
 *
 * **The seed owns these documents; this lane only reads them.** `BillersSeeder` writes the
 * collection keyed on the biller's slug, and nothing here creates, edits or deletes a row.
 * The schema exists so the reads are typed and indexed, not to claim ownership — which is
 * also why `id` is a plain indexed string rather than the shared `publicIdProp`: a slug
 * like `thames-water` is stable across environments in a way a generated identifier is not,
 * and that stability is what lets a fixture written today still resolve next month.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: BILLER_COLLECTION, id: false })
export class BillerSchemaClass {
  @Prop({ type: String, required: true, unique: true, index: true })
  id!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: Object.values(BillerCategory), index: true })
  category!: BillerCategory;

  @Prop({ type: String, default: null })
  logoUrl!: string | null;

  /** Regex the customer's reference with this biller must satisfy, as a string. */
  @Prop({ type: String, required: true })
  accountNumberPattern!: string;

  @Prop({ type: String, required: true })
  accountNumberLabel!: string;

  @Prop(moneyProp)
  minAmount!: StoredMoney;

  @Prop(moneyProp)
  maxAmount!: StoredMoney;

  @Prop(moneyProp)
  fee!: StoredMoney;

  /** Whether the rail can confirm the payee before the debit. */
  @Prop({ type: Boolean, required: true })
  supportsValidation!: boolean;

  @Prop({ type: Boolean, required: true, index: true })
  active!: boolean;
}

export type BillerDocument = HydratedDocument<BillerSchemaClass>;

export const BillerSchema = SchemaFactory.createForClass(BillerSchemaClass);

/** The directory screen: browse by category, alphabetical inside it. */
BillerSchema.index({ active: 1, category: 1, name: 1 });
