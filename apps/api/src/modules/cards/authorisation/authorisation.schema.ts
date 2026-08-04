import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { AuthorisationStatus, DeclineReason } from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
  publicIdProp,
} from '../../../database/schema.helpers.js';
import { CARD_AUTHORISATION_COLLECTION } from '../card.constants.js';

import { type AuthorisationChannel } from './authorisation.store.js';

/** Channels an authorisation can arrive over, for the enum validator. */
const CHANNELS: readonly AuthorisationChannel[] = [
  'ONLINE',
  'CONTACTLESS',
  'CHIP',
  'MAGSTRIPE',
  'ATM',
  'RECURRING',
];

/**
 * One authorisation attempt, whatever the issuer answered.
 *
 * Declines are first-class rows rather than log lines. They are what a customer asks
 * about, what a fraud analyst reconstructs a compromise from, and what proves a card
 * control actually did something — a control with no record of having declined anything
 * is indistinguishable from a control that is broken.
 *
 * There is no PAN here either, and no CVV. An authorisation names the card by its id.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: CARD_AUTHORISATION_COLLECTION, id: false })
export class AuthorisationSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  cardId!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  accountId!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, enum: Object.values(AuthorisationStatus) })
  status!: AuthorisationStatus;

  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop(moneyProp)
  requestedAmount!: StoredMoney;

  @Prop(optionalMoneyProp)
  originalAmount!: StoredMoney | null;

  @Prop({ type: String, required: true, immutable: true, index: true })
  merchantId!: string;

  @Prop({ type: String, required: true, immutable: true })
  merchantName!: string;

  @Prop({ type: String, required: true, immutable: true })
  merchantCountry!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  mcc!: string;

  @Prop({ type: String, required: true, immutable: true, enum: CHANNELS })
  channel!: AuthorisationChannel;

  @Prop({ type: String, default: null, enum: [...Object.values(DeclineReason), null] })
  declineReason!: DeclineReason | null;

  @Prop({ type: String, required: true })
  responseCode!: string;

  @Prop({ type: String, default: null })
  holdId!: string | null;

  @Prop({ type: String, default: null })
  journalEntryId!: string | null;

  @Prop({ type: String, default: null })
  transactionId!: string | null;

  @Prop({ type: Boolean, default: false })
  threeDsChallenged!: boolean;

  @Prop({ type: String, default: null })
  threeDsOutcome!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  networkReference!: string;

  @Prop({ type: String, default: null })
  clearingReference!: string | null;

  @Prop({ type: String, default: null, index: true })
  settlementBatchId!: string | null;

  @Prop(optionalMoneyProp)
  capturedAmount!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  refundedAmount!: StoredMoney | null;

  @Prop({ type: Number, default: 0 })
  incrementCount!: number;

  @Prop({ type: Date, required: true, immutable: true })
  authorisedAt!: Date;

  @Prop({ type: Date, default: null })
  capturedAt!: Date | null;

  @Prop({ type: Date, default: null })
  clearedAt!: Date | null;

  @Prop({ type: Date, default: null })
  settledAt!: Date | null;

  @Prop({ type: Date, default: null })
  reversedAt!: Date | null;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type AuthorisationDocument = HydratedDocument<AuthorisationSchemaClass>;

export const AuthorisationSchema = SchemaFactory.createForClass(AuthorisationSchemaClass);

/** The card's own feed, and the spend windows every limit check reads. */
AuthorisationSchema.index({ cardId: 1, authorisedAt: -1 });

/** The customer-wide authorisation feed. */
AuthorisationSchema.index({ userId: 1, authorisedAt: -1 });

/**
 * The expiry sweep: approved authorisations nobody claimed.
 *
 * Partial, because only an `APPROVED` authorisation can lapse and approvals are a small
 * working set beside the captured history that accumulates forever.
 */
AuthorisationSchema.index(
  { expiresAt: 1 },
  { partialFilterExpression: { status: AuthorisationStatus.APPROVED } },
);

/** The settlement batch: captured items the scheme has presented but not yet settled. */
AuthorisationSchema.index({ clearedAt: 1, settlementBatchId: 1 });
