import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { HoldReason, HoldStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { HOLD_COLLECTION } from './hold.constants.js';

/**
 * A claim on money the customer still owns but cannot spend.
 *
 * A hold never touches `ledgerBalance`. That is the whole point of it: a card
 * authorisation is a merchant's promise-to-claim, not a movement, and the money remains
 * the customer's until the merchant captures it or the authorisation dies. What a hold
 * moves is availability, by way of `holdTotal` on the account.
 *
 * **There is deliberately no Mongo TTL index on `expiresAt`.** A TTL index deletes the
 * document, and deleting a hold would (a) lose the record of why money was unspendable
 * for three days, which is exactly what a customer disputes, and (b) leave `holdTotal`
 * standing forever, because nothing would run to give the money back. Expiry is a sweep
 * that resolves each hold and restores the reserve in a transaction — see
 * `HoldService.expireDue`. The index below is what makes that sweep a single indexed read.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: HOLD_COLLECTION, id: false })
export class HoldSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  accountId!: string;

  /** Always positive. A hold for nothing is not a hold. */
  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ type: String, required: true, enum: Object.values(HoldReason), immutable: true })
  reason!: HoldReason;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(HoldStatus),
    default: HoldStatus.ACTIVE,
  })
  status!: HoldStatus;

  /** What the customer sees next to the pending line on their statement. */
  @Prop({ type: String, required: true })
  description!: string;

  @Prop({ type: Date, required: true, immutable: true })
  placedAt!: Date;

  /**
   * When the hold lapses on its own, or null for one that never does.
   *
   * A card authorisation expires by scheme rule; a court order does not expire at all,
   * and null says so rather than encoding "never" as a date a century away.
   */
  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  /** When the hold left `ACTIVE`, whichever way it went. Null while it is still live. */
  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  /** The card authorisation this hold backs, when it has one. */
  @Prop({ type: String, default: null })
  authorisationId!: string | null;

  /**
   * How much was actually taken, which may be less than the hold.
   *
   * A fuel pump authorises a hundred and captures thirty; the difference was never spent
   * and goes straight back to availability. Recording the captured amount separately is
   * what lets a statement explain the gap.
   */
  @Prop(optionalMoneyProp)
  capturedAmount!: StoredMoney | null;

  /** The journal entry the capture booked, linking the hold to the real movement. */
  @Prop({ type: String, default: null })
  capturedEntryId!: string | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type HoldDocument = HydratedDocument<HoldSchemaClass>;

export const HoldSchema = SchemaFactory.createForClass(HoldSchemaClass);

/** Listing an account's live holds, and reconciling `holdTotal` against them. */
HoldSchema.index({ accountId: 1, status: 1, placedAt: -1 });

/**
 * The expiry sweep: live holds whose time has passed, oldest first.
 *
 * Partial, because a resolved hold can never expire and resolved holds accumulate
 * forever while live ones are a small working set.
 */
HoldSchema.index({ expiresAt: 1 }, { partialFilterExpression: { status: HoldStatus.ACTIVE } });
