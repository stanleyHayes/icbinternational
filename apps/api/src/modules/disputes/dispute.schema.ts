import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { DisputeReason, DisputeStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { DISPUTE_COLLECTION } from './disputes.constants.js';

/**
 * One step in the dispute's history, embedded.
 *
 * The contract ships the timeline with the dispute, so it is stored with it rather than
 * in a side collection — a dispute's history is read every time the dispute is.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class DisputeTimelineSchemaClass {
  @Prop({ required: true, type: String, enum: Object.values(DisputeStatus) })
  status!: DisputeStatus;

  @Prop({ required: true, type: Date })
  at!: Date;

  @Prop({ required: true, type: String })
  detail!: string;
}

export const DisputeTimelineSchema = SchemaFactory.createForClass(DisputeTimelineSchemaClass);

/**
 * A card dispute: chargeback, evidence, outcome.
 *
 * `transactionId` is unique — one dispute per transaction, which is both the scheme
 * rule and the replay guard: a double-submitted raise loses the unique-index race and
 * the service answers `DISPUTE_ALREADY_RAISED` with the existing case.
 *
 * The money the case moved is recorded as journal-entry ids
 * (`provisionalCreditEntryId`, `resolutionEntryId`) so the ledger stays the system of
 * record and this document only points into it.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: DISPUTE_COLLECTION, id: false })
export class DisputeSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, immutable: true })
  transactionId!: string;

  /** Denormalised owner — every customer query is scoped by it, never by a lookup. */
  @Prop({ required: true, type: String, immutable: true })
  userId!: string;

  @Prop({ required: true, type: String, immutable: true })
  accountId!: string;

  @Prop({ required: true, type: String, enum: Object.values(DisputeStatus) })
  status!: DisputeStatus;

  @Prop({ required: true, type: String, enum: Object.values(DisputeReason), immutable: true })
  reason!: DisputeReason;

  @Prop({ required: true, type: String, immutable: true })
  description!: string;

  @Prop(moneyProp)
  disputedAmount!: StoredMoney;

  @Prop(optionalMoneyProp)
  provisionalCredit!: StoredMoney | null;

  @Prop({ required: false, type: Date, default: null })
  provisionalCreditAt!: Date | null;

  /** The journal entry that booked the credit. Its reversal takes the credit back. */
  @Prop({ required: false, type: String, default: null })
  provisionalCreditEntryId!: string | null;

  /** The `DISPUTE_RESOLUTION` entry, when a won case settled the suspense. */
  @Prop({ required: false, type: String, default: null })
  resolutionEntryId!: string | null;

  @Prop({ required: true, type: [String], default: () => [] })
  evidenceIds!: string[];

  @Prop({ required: false, type: String, default: null })
  merchantResponse!: string | null;

  @Prop({ required: false, type: String, default: null })
  outcomeSummary!: string | null;

  /** Whether the customer contacted the merchant first, as the scheme expects. */
  @Prop({ required: true, type: Boolean, immutable: true })
  contactedMerchant!: boolean;

  @Prop({ required: true, type: [DisputeTimelineSchema], default: () => [] })
  timeline!: DisputeTimelineSchemaClass[];

  /** When the merchant's simulated answer arrives. */
  @Prop({ required: true, type: Date, immutable: true })
  merchantResponseDueAt!: Date;

  /** The regulatory decision deadline, shown to the customer. */
  @Prop({ required: true, type: Date, immutable: true })
  decisionDueAt!: Date;

  @Prop({ required: true, type: Date, immutable: true })
  createdAt!: Date;

  @Prop({ required: false, type: Date, default: null })
  resolvedAt!: Date | null;
}

export const DisputeSchema = SchemaFactory.createForClass(DisputeSchemaClass);

export type DisputeDocument = HydratedDocument<DisputeSchemaClass>;

/** One dispute per transaction — the scheme rule, enforced by the database. */
DisputeSchema.index({ transactionId: 1 }, { unique: true });

/** The customer's own list, newest first. */
DisputeSchema.index({ userId: 1, createdAt: -1, id: -1 });

/** The operations queue, oldest case first, and the status filter over it. */
DisputeSchema.index({ status: 1, createdAt: 1, id: 1 });
