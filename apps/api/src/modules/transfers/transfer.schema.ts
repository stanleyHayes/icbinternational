import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { TransferRail, TransferStatus, type TransferDestination } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  moneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { TRANSFER_COLLECTION } from './transfer.constants.js';

/** One status change, as stored. Append-only; see `transfer-timeline.ts`. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class TransferEventSchemaClass {
  @Prop({ type: String, required: true, enum: Object.values(TransferStatus) })
  status!: TransferStatus;

  @Prop({ type: Date, required: true })
  at!: Date;

  @Prop({ type: String, required: true })
  detail!: string;
}

export const TransferEventSchema = SchemaFactory.createForClass(TransferEventSchemaClass);

/**
 * A customer-facing payment instruction and its history.
 *
 * **A transfer is not where the money is.** The journal entry is. Everything monetary on
 * this document is a record of what was instructed and what the ledger then did, and
 * `journalEntryId` is the link back to the truth. If the two ever disagree, the journal
 * wins and this row is the thing that gets rebuilt — which is why nothing reads a balance
 * from here.
 *
 * **`quoteId` is unique.** A quote is priced once and may be executed once, and that is
 * enforced by an index rather than by a check in a service: two executions of the same
 * quote race on the insert and the database picks a winner. Combined with a journal
 * reference derived from the same quote id, a customer cannot be debited twice for one
 * instruction even if every layer above the database is retried.
 *
 * **`status` is denormalised from the last timeline event.** The timeline is the record;
 * the field exists so that "show me everything still pending" is an index scan rather than
 * an aggregation over an array.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: TRANSFER_COLLECTION, id: false })
export class TransferSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  /** The quote this execution is bound to. Unique — one quote buys one transfer. */
  @Prop({ type: String, required: true, immutable: true, unique: true })
  quoteId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(TransferRail) })
  rail!: TransferRail;

  @Prop({ type: String, required: true, enum: Object.values(TransferStatus), index: true })
  status!: TransferStatus;

  @Prop({ type: String, required: true, immutable: true, index: true })
  sourceAccountId!: string;

  /** Validated against `transferDestinationSchema` before it reaches this document. */
  @Prop({ type: SchemaTypes.Mixed, required: true, immutable: true })
  destination!: TransferDestination;

  /** The credited account, for an internal transfer. Null once value leaves the bank. */
  @Prop({ type: String, default: null, immutable: true })
  destinationAccountId!: string | null;

  /** What left the sender, fee included. */
  @Prop(moneyProp)
  debitAmount!: StoredMoney;

  /** What reached the payee. Differs from the debit by the fee. */
  @Prop(moneyProp)
  creditAmount!: StoredMoney;

  @Prop(moneyProp)
  fee!: StoredMoney;

  @Prop({ type: String, default: null })
  exchangeRate!: string | null;

  /** The customer's own narrative, carried to both sides of the payment. */
  @Prop({ type: String, default: null })
  reference!: string | null;

  /** Rail tracking identifier — a UETR for SWIFT, a batch id for ACH. */
  @Prop({ type: String, default: null })
  railReference!: string | null;

  @Prop({ type: String, default: null })
  returnCode!: string | null;

  @Prop({ type: String, default: null })
  returnReason!: string | null;

  /** The entry that actually moved the money. The link to the system of record. */
  @Prop({ type: String, default: null, index: true })
  journalEntryId!: string | null;

  /** The separate `FEE` entry, when the payment carried one. */
  @Prop({ type: String, default: null })
  feeJournalEntryId!: string | null;

  /** The saved payee this went to, when it matched one. */
  @Prop({ type: String, default: null })
  beneficiaryId!: string | null;

  @Prop({ type: [TransferEventSchema], required: true, default: () => [] })
  timeline!: TransferEventSchemaClass[];

  @Prop({ type: Date, default: null })
  estimatedArrival!: Date | null;

  @Prop({ type: Date, default: null })
  settledAt!: Date | null;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: () => ({}) })
  metadata!: Record<string, string>;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type TransferDocument = HydratedDocument<TransferSchemaClass>;

export const TransferSchema = SchemaFactory.createForClass(TransferSchemaClass);

/** The customer's list, cursored on `(createdAt, id)`. Covers the status/rail filters. */
TransferSchema.index({ userId: 1, createdAt: -1, id: -1 });

/** "What is still moving?" — the operations view and the customer's pending list. */
TransferSchema.index({ status: 1, createdAt: -1 });
