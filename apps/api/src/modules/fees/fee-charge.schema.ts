import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { FeeKind } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { FEE_CHARGE_COLLECTION, FeeChargeSource } from './fees.constants.js';

/**
 * One assessed fee: the fee module's own transaction line.
 *
 * Every charge the engine records lands here exactly once — `chargeKey` is unique and is
 * the store-level guarantee that a period or an event is never charged twice, behind the
 * service's read-before-write and in front of the ledger's unique `reference`.
 *
 * A waived fee is recorded too, with a zero amount and no journal entry: "why was I not
 * charged?" should be answerable from data, not inferred from an absence. The journal
 * remains the system of record for money; this collection is the audit of the decision.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: FEE_CHARGE_COLLECTION, id: false })
export class FeeChargeSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  accountId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(FeeKind) })
  kind!: FeeKind;

  /**
   * Business-unique key: `kind:accountId:period` for scheduled fees,
   * `kind:sourceId` for event fees. The unique index is the idempotency arbiter.
   */
  @Prop({ type: String, required: true, immutable: true, unique: true })
  chargeKey!: string;

  /** The `YYYY-MM` a scheduled fee covers. Null for event fees. */
  @Prop({ type: String, default: null, immutable: true })
  periodKey!: string | null;

  /** The amount actually charged. Zero when the fee was waived. */
  @Prop(moneyProp)
  amount!: StoredMoney;

  /** Why the fee came out at zero (`FeeWaiver`), or null when money moved. */
  @Prop({ type: String, default: null, immutable: true })
  waivedBy!: string | null;

  /** The balanced journal entry this charge booked, when it booked one. */
  @Prop({ type: String, default: null, immutable: true })
  journalEntryId!: string | null;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(FeeChargeSource) })
  source!: FeeChargeSource;

  /** The billable event's stable id (an authorisation, a quote). Null for scheduled fees. */
  @Prop({ type: String, default: null, immutable: true })
  sourceId!: string | null;

  /** The human narrative, mirrored onto the journal entry and the statement line. */
  @Prop({ type: String, required: true, immutable: true })
  description!: string;

  @Prop({ type: Date, required: true, immutable: true })
  chargedAt!: Date;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type FeeChargeDocument = HydratedDocument<FeeChargeSchemaClass>;

export const FeeChargeSchema = SchemaFactory.createForClass(FeeChargeSchemaClass);

/** An account's fee history, newest first — the "what was I charged?" query. */
FeeChargeSchema.index({ accountId: 1, chargedAt: -1 });
