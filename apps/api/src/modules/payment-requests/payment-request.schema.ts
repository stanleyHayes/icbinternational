import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { PaymentRequestStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { PAYMENT_REQUEST_COLLECTION } from './payment-request.constants.js';

/**
 * A request for money, and whatever became of it.
 *
 * **The token is unique and indexed.** It is the whole of the link's security: anybody
 * holding it can see what is being asked for and pay it, and nobody without it can find the
 * request at all. It is therefore generated from a cryptographic source rather than derived
 * from the id — a request whose link could be computed from a sequence would be a request
 * anybody could enumerate.
 *
 * **`status` moves only through the conditional write in the repository.** "An expired
 * request cannot be paid" is enforced by that filter, not by a check in a service: two taps
 * on a link that lapsed in between must both fail, and only the database can say which of
 * them arrived first.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: PAYMENT_REQUEST_COLLECTION, id: false })
export class PaymentRequestSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(PaymentRequestStatus),
    index: true,
  })
  status!: PaymentRequestStatus;

  @Prop({ type: String, required: true, immutable: true })
  requesterName!: string;

  @Prop({ type: String, default: null })
  payeeName!: string | null;

  @Prop({ type: String, default: null })
  payeeEmail!: string | null;

  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ type: String, default: null })
  note!: string | null;

  /** The unguessable part of the share link. See the note on this class. */
  @Prop({ type: String, required: true, unique: true, immutable: true })
  token!: string;

  @Prop({ type: String, required: true, immutable: true })
  destinationAccountId!: string;

  /** Groups every request created by one split bill. */
  @Prop({ type: String, default: null, index: true })
  splitId!: string | null;

  @Prop({ type: String, default: null })
  paidByUserId!: string | null;

  @Prop({ type: String, default: null })
  paidByName!: string | null;

  @Prop({ type: String, default: null })
  paidFromAccountId!: string | null;

  @Prop({ type: String, default: null })
  journalEntryId!: string | null;

  @Prop({ type: Number, required: true, default: 0 })
  nudgeCount!: number;

  @Prop({ type: Date, default: null })
  lastNudgedAt!: Date | null;

  @Prop({ type: Date, required: true, index: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type PaymentRequestDocument = HydratedDocument<PaymentRequestSchemaClass>;

export const PaymentRequestSchema = SchemaFactory.createForClass(PaymentRequestSchemaClass);

/** The requester's list, newest first. */
PaymentRequestSchema.index({ userId: 1, createdAt: -1, id: -1 });

/** The expiry sweep's read: still open, and past its window. */
PaymentRequestSchema.index({ status: 1, expiresAt: 1 });
