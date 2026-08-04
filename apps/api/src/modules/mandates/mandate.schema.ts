import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { MandateStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { MandateFrequency, MANDATE_COLLECTION_NAME } from './mandate.constants.js';

/** One collection, as stored. Keyed on the journal entry that moved the money. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class MandateCollectionSchemaClass {
  @Prop({ type: String, required: true })
  journalEntryId!: string;

  @Prop({ type: String, default: null })
  settlementEntryId!: string | null;

  @Prop({ type: String, default: null })
  transactionId!: string | null;

  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ type: Date, required: true })
  collectedAt!: Date;

  @Prop({ type: Date, default: null })
  refundedAt!: Date | null;

  @Prop({ type: String, default: null })
  refundEntryId!: string | null;

  @Prop({ type: String, default: null })
  refundReason!: string | null;
}

export const MandateCollectionSchema = SchemaFactory.createForClass(MandateCollectionSchemaClass);

/**
 * A standing authority for a merchant to take money, and everything they have taken.
 *
 * **The collection history lives on the mandate.** A direct debit is collected monthly, so
 * the array is bounded in practice and capped in the repository at the length of the
 * guarantee window. Keeping it here means "what has this merchant taken from me, and was
 * any of it refunded?" is one read of one document — the question a customer disputing a
 * collection actually asks.
 *
 * **`status` is the gate on collecting.** Every collection claims the mandate with a
 * conditional write naming `ACTIVE`, so a cancellation that lands first makes the next
 * collection match nothing and change nothing. That is what "cancelling blocks the next
 * collection" means in practice, and it is enforced by the database rather than by a check
 * a future caller might forget.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: MANDATE_COLLECTION_NAME, id: false })
export class MandateSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, enum: Object.values(MandateStatus), index: true })
  status!: MandateStatus;

  @Prop({ type: String, required: true, immutable: true })
  merchantName!: string;

  @Prop({ type: String, default: null })
  merchantLogoUrl!: string | null;

  @Prop({ type: String, required: true, immutable: true, index: true })
  accountId!: string;

  @Prop({ type: String, required: true, immutable: true })
  reference!: string;

  @Prop(optionalMoneyProp)
  fixedAmount!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  maxAmount!: StoredMoney | null;

  @Prop({ type: String, required: true, enum: Object.values(MandateFrequency) })
  frequency!: MandateFrequency;

  @Prop({ type: Date, default: null })
  lastCollectedAt!: Date | null;

  @Prop(optionalMoneyProp)
  lastAmount!: StoredMoney | null;

  @Prop({ type: Date, default: null, index: true })
  nextExpectedAt!: Date | null;

  @Prop({ type: [MandateCollectionSchema], required: true, default: () => [] })
  collections!: MandateCollectionSchemaClass[];

  @Prop({ type: Date, default: null })
  cancelledAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type MandateDocument = HydratedDocument<MandateSchemaClass>;

export const MandateSchema = SchemaFactory.createForClass(MandateSchemaClass);

/** The customer's list of standing authorities. */
MandateSchema.index({ userId: 1, status: 1, createdAt: -1 });

/** The collection sweep's read: active, and due. */
MandateSchema.index({ status: 1, nextExpectedAt: 1 });
