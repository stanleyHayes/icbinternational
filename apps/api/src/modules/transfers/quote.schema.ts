import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { ChargeBearer, FeeKind, TransferRail, type TransferDestination } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { TRANSFER_QUOTE_COLLECTION } from './transfer.constants.js';

/**
 * A price the bank has committed to, for a window.
 *
 * The document exists so that execution can bind to a *stored* price rather than re-deriving
 * one. Re-pricing at execution would mean the figures on the confirmation screen and the
 * figures that hit the account were produced by two different runs of the same code against
 * two different snapshots of the world — and the customer would only ever find out from
 * their statement.
 *
 * `consumedByTransferId` makes the quote single-use. `expiresAt` makes it perishable. The
 * two together are what "you cannot be repriced, and you cannot hoard a price" means.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: TRANSFER_QUOTE_COLLECTION, id: false })
export class TransferQuoteSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(TransferRail) })
  rail!: TransferRail;

  @Prop({ type: String, required: true, immutable: true })
  sourceAccountId!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true, immutable: true })
  destination!: TransferDestination;

  @Prop({ type: String, default: null, immutable: true })
  destinationAccountId!: string | null;

  @Prop(moneyProp)
  debitAmount!: StoredMoney;

  @Prop(moneyProp)
  creditAmount!: StoredMoney;

  @Prop(moneyProp)
  fee!: StoredMoney;

  /** The schedule entry the fee was priced against. Null when nothing priced it. */
  @Prop({ type: String, default: null, enum: [...Object.values(FeeKind), null] })
  feeKind!: FeeKind | null;

  @Prop({ type: String, default: null })
  exchangeRate!: string | null;

  @Prop({ type: Date, default: null })
  rateExpiresAt!: Date | null;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ChargeBearer),
    default: ChargeBearer.SHA,
  })
  chargeBearer!: ChargeBearer;

  @Prop({ type: Boolean, required: true, default: false })
  requiresStepUp!: boolean;

  /** Things the customer should read before authorising. Never a reason to refuse. */
  @Prop({ type: [String], required: true, default: () => [] })
  warnings!: string[];

  @Prop({ type: Date, required: true })
  estimatedArrival!: Date;

  @Prop({ type: Date, default: null })
  cutOffAt!: Date | null;

  @Prop({ type: Date, required: true, immutable: true })
  expiresAt!: Date;

  /** The transfer that spent this quote. Null while it is still executable. */
  @Prop({ type: String, default: null })
  consumedByTransferId!: string | null;

  /**
   * When Mongo may reap the document.
   *
   * Long after `expiresAt`, deliberately: an expired quote is useless to a customer but is
   * the binding evidence for what they were quoted, and a fee is disputed weeks later.
   */
  @Prop({ type: Date, required: true })
  reapAt!: Date;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type TransferQuoteDocument = HydratedDocument<TransferQuoteSchemaClass>;

export const TransferQuoteSchema = SchemaFactory.createForClass(TransferQuoteSchemaClass);

/**
 * Retention, expressed as a TTL rather than a sweep.
 *
 * Safe here in a way it is not for a hold: nothing hangs off a quote once its transfer
 * exists — the transfer carries its own copy of every figure — so deleting the row strands
 * no balance and loses no money, only the pricing worksheet after the dispute window.
 */
TransferQuoteSchema.index({ reapAt: 1 }, { expireAfterSeconds: 0 });

/** The customer's outstanding quotes, newest first. */
TransferQuoteSchema.index({ userId: 1, createdAt: -1 });
