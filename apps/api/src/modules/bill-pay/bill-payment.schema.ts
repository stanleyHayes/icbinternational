import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { BillPaymentStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';
import { BillerRejection } from '../../rails/biller/index.js';

import { BILL_PAYMENT_COLLECTION } from './bill-pay.constants.js';
import { PaymentKind, type TopUpDetail } from './bill-payment.store.js';

/**
 * A payment to somebody outside the bank, and everything that happened to it.
 *
 * **The money is not here.** `journalEntryId` points at the entry that took it,
 * `reversalEntryId` at the entry that gave it back, and if this document ever disagreed
 * with them the journal would win and this row would be rebuilt. Nothing reads a balance
 * from here.
 *
 * **Every entry id is a separate field, deliberately.** A payment that was debited,
 * refunded and retried has three entries against it, and collapsing them into one
 * "entryId" would make "did this customer actually get their money back?" a question about
 * parsing narratives instead of reading a column.
 *
 * `status` is denormalised so "what is still in flight?" is an index scan, and every change
 * to it goes through the conditional write in the repository.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: BILL_PAYMENT_COLLECTION, id: false })
export class BillPaymentSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(PaymentKind) })
  kind!: PaymentKind;

  @Prop({ type: String, required: true, immutable: true, index: true })
  billerId!: string;

  @Prop({ type: String, required: true, immutable: true })
  billerName!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(BillPaymentStatus),
    index: true,
  })
  status!: BillPaymentStatus;

  @Prop({ type: String, required: true, immutable: true })
  sourceAccountId!: string;

  @Prop({ type: String, required: true, immutable: true })
  customerReference!: string;

  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop(moneyProp)
  fee!: StoredMoney;

  /** Provider, handset and bundle for a top-up; null for a bill payment. */
  @Prop({ type: SchemaTypes.Mixed, default: null })
  topUp!: TopUpDetail | null;

  @Prop({ type: String, default: null })
  billerReceipt!: string | null;

  /** The network's refusal code. The customer-facing sentence is derived from it. */
  @Prop({ type: String, default: null, enum: [...Object.values(BillerRejection), null] })
  rejection!: BillerRejection | null;

  @Prop({ type: String, default: null })
  failureReason!: string | null;

  @Prop({ type: String, default: null })
  transactionId!: string | null;

  @Prop({ type: String, default: null, index: true })
  journalEntryId!: string | null;

  @Prop({ type: String, default: null })
  settlementEntryId!: string | null;

  @Prop({ type: String, default: null })
  reversalEntryId!: string | null;

  @Prop({ type: String, default: null })
  feeEntryId!: string | null;

  @Prop({ type: Number, required: true, default: 0 })
  attempts!: number;

  @Prop({ type: Number, default: null })
  lastLatencyMs!: number | null;

  /** When it should go out. Equal to `createdAt` for an instant payment. */
  @Prop({ type: Date, required: true, index: true })
  scheduledFor!: Date;

  @Prop({ type: Date, default: null })
  submittedAt!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type BillPaymentDocument = HydratedDocument<BillPaymentSchemaClass>;

export const BillPaymentSchema = SchemaFactory.createForClass(BillPaymentSchemaClass);

/** The customer's list, newest first, covering the status and biller filters. */
BillPaymentSchema.index({ userId: 1, createdAt: -1, id: -1 });

/** The scheduler's read: what is due and has not gone out yet. */
BillPaymentSchema.index({ status: 1, scheduledFor: 1 });

/** The refund sweep's read: what went out, and how long ago, so strandings surface fast. */
BillPaymentSchema.index({ status: 1, submittedAt: 1 });
