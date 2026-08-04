import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { NameCheckResult, type TransferDestination } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import { BENEFICIARY_COLLECTION, CURRENCY_CODE_LENGTH } from './beneficiary.constants.js';

/**
 * A payee the customer has chosen to keep.
 *
 * Two fields carry the weight of this collection and neither is obvious.
 *
 * **`destination` is stored as an opaque object**, not decomposed into columns. It is a
 * discriminated union across three rails whose fields have nothing in common — an IBAN and
 * a sort code are not the same kind of thing wearing different names — and flattening them
 * into one document shape would produce a row where two thirds of the fields are null and
 * no index means anything. The contract's own schema is the validator; `matchKeys` is what
 * makes it queryable.
 *
 * **`trustedFrom` is written once, at creation, and never moved.** It is the instant the
 * cooling-off window closes, not a flag somebody flips. A stored instant survives a
 * process restart, cannot be advanced by a retry, and — because the simulated clock is the
 * only clock — moves correctly when operations fast-forward time.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: BENEFICIARY_COLLECTION, id: false })
export class BeneficiarySchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, trim: true })
  nickname!: string;

  /** Validated against `transferDestinationSchema` before it ever reaches this document. */
  @Prop({ type: SchemaTypes.Mixed, required: true, immutable: true })
  destination!: TransferDestination;

  /** Canonical keys this payee answers to. See `destination-key.ts`. */
  @Prop({ type: [String], required: true, immutable: true })
  matchKeys!: string[];

  @Prop({ type: String, required: true, immutable: true, length: CURRENCY_CODE_LENGTH })
  currency!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(NameCheckResult),
    default: NameCheckResult.UNAVAILABLE,
  })
  nameCheck!: NameCheckResult;

  @Prop({ type: String, default: null })
  nameCheckSuggestion!: string | null;

  @Prop({ type: Boolean, default: false })
  isFavourite!: boolean;

  /** When the cooling-off window closes. Immutable: a payee cannot be trusted early. */
  @Prop({ type: Date, required: true, immutable: true })
  trustedFrom!: Date;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type BeneficiaryDocument = HydratedDocument<BeneficiarySchemaClass>;

export const BeneficiarySchema = SchemaFactory.createForClass(BeneficiarySchemaClass);

/**
 * One customer cannot save the same destination twice.
 *
 * Partial on `matchKeys` being present so the index never has to reason about a document
 * mid-migration, and unique so that "add the payee I already have" is arbitrated by the
 * database rather than by a read-then-write that two concurrent taps both pass.
 */
BeneficiarySchema.index(
  { userId: 1, matchKeys: 1 },
  { unique: true, partialFilterExpression: { matchKeys: { $exists: true } } },
);

/** The list view: favourites first, then most recently used, then newest. */
BeneficiarySchema.index({ userId: 1, isFavourite: -1, lastUsedAt: -1, createdAt: -1 });
