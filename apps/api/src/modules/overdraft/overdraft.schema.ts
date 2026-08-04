/**
 * The stored shape of an overdraft facility, and the index that keeps it single.
 *
 * **The unique partial index on `{ accountId }` where `status: ACTIVE` is the correctness
 * mechanism of this module.** `OverdraftService.request` reads for a live facility, then
 * awaits a credit decision, then inserts. Two requests arriving together both pass the
 * read and both reach the insert, and an account with two `ACTIVE` facilities has two
 * limits — with the available balance computed from whichever the store returns first.
 * A check cannot close that window; only the database refusing the second write can.
 *
 * Partial rather than plain unique, because the history is the point: a customer who has
 * had a facility withdrawn and asks for another is a different decision from one who has
 * never had one, so declined, suspended and closed rows stay on the account. Only *live*
 * ones are constrained to one.
 *
 * The lane still binds `InMemoryOverdraftStore`, which enforces the same rule in
 * `insertIfNoActiveFacility`. This schema is the contract the Mongo-backed repository must
 * satisfy when the lane is persisted — see `docs/HANDOFFS.md`.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { OVERDRAFT_COLLECTION } from './overdraft.constants.js';
import { OverdraftStatus } from './overdraft.store.js';

@Schema({ ...BASE_SCHEMA_OPTIONS, collection: OVERDRAFT_COLLECTION, id: false })
export class OverdraftSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  /** The current account the facility attaches to. One live facility per account. */
  @Prop({ type: String, required: true, immutable: true })
  accountId!: string;

  @Prop({ type: String, required: true, enum: Object.values(OverdraftStatus), index: true })
  status!: OverdraftStatus;

  @Prop(moneyProp)
  requestedLimit!: StoredMoney;

  /** What was actually granted. Zero until a decision is made. */
  @Prop(moneyProp)
  limit!: StoredMoney;

  @Prop({ type: Number, required: true })
  aprBps!: number;

  /** An account the sweep may draw on. Null when the customer nominated none. */
  @Prop({ type: String, default: null })
  sweepFromAccountId!: string | null;

  @Prop({ type: [String], required: true, default: () => [] })
  declineReasons!: string[];

  @Prop({ type: Date, required: true, immutable: true })
  requestedAt!: Date;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  /** Last business date interest was charged for, so a day is never charged twice. */
  @Prop({ type: String, default: null })
  lastAccruedOn!: string | null;

  @Prop(moneyProp)
  interestChargedToDate!: StoredMoney;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type OverdraftDocument = HydratedDocument<OverdraftSchemaClass>;

export const OverdraftSchema = SchemaFactory.createForClass(OverdraftSchemaClass);

/** One live facility per account. The whole reason this file declares an index at all. */
OverdraftSchema.index(
  { accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: OverdraftStatus.ACTIVE },
    name: 'one_active_facility_per_account',
  },
);

/** The accrual sweep: live facilities not yet charged for this business date. */
OverdraftSchema.index({ status: 1, lastAccruedOn: 1, requestedAt: 1 });
