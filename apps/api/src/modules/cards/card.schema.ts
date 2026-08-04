import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { CardFormat, CardScheme, CardStatus, CardTier } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  optionalMoneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { CARD_COLLECTION } from './card.constants.js';

/** Channel switches and ceilings, embedded on the card they govern. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class CardControlsSchemaClass {
  @Prop({ type: Boolean, required: true })
  onlinePayments!: boolean;

  @Prop({ type: Boolean, required: true })
  contactless!: boolean;

  @Prop({ type: Boolean, required: true })
  atmWithdrawals!: boolean;

  @Prop({ type: Boolean, required: true })
  internationalPayments!: boolean;

  /**
   * Magnetic stripe, off by default.
   *
   * A stripe carries no cryptogram and can be cloned from a single swipe. It exists on
   * the card because a handful of countries still fall back to it, and it is off until
   * the customer says they are going somewhere that needs it.
   */
  @Prop({ type: Boolean, required: true })
  magstripe!: boolean;

  @Prop(optionalMoneyProp)
  perTransactionLimit!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  dailySpendLimit!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  monthlySpendLimit!: StoredMoney | null;

  @Prop(optionalMoneyProp)
  dailyAtmLimit!: StoredMoney | null;

  @Prop({ type: [String], default: [] })
  blockedMccs!: string[];

  @Prop({ type: [String], default: [] })
  allowedCountries!: string[];
}

export const CardControlsSchema = SchemaFactory.createForClass(CardControlsSchemaClass);

/**
 * An issued card.
 *
 * **There is no PAN field, and adding one would be a defect rather than a feature.** The
 * card stores an opaque `panToken`, the last four digits, and nothing else that could
 * reconstruct the number. The reveal endpoint derives the PAN from the token and a key
 * held in the environment, so a stolen database dump yields no card numbers at all — not
 * encrypted ones, not hashed ones, none.
 *
 * The PIN is stored the way a password is: an Argon2 digest, verified never read. A field
 * a support agent could be socially engineered into reading aloud is a field that will
 * eventually be read aloud.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: CARD_COLLECTION, id: false })
export class CardSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  accountId!: string;

  /** Denormalised from the account so a card feed never needs a join to check ownership. */
  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(CardFormat) })
  format!: CardFormat;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(CardScheme) })
  scheme!: CardScheme;

  @Prop({ type: String, required: true, enum: Object.values(CardTier) })
  tier!: CardTier;

  @Prop({ type: String, required: true, enum: Object.values(CardStatus), index: true })
  status!: CardStatus;

  @Prop({ type: String, default: null })
  nickname!: string | null;

  @Prop({ type: String, required: true })
  cardholderName!: string;

  /**
   * The tokenised card number. Opaque, unique, and the only handle on the PAN there is.
   *
   * Unique so that two cards can never resolve to the same number, which would let one
   * customer's reveal show another customer's card.
   */
  @Prop({ type: String, required: true, unique: true, immutable: true })
  panToken!: string;

  @Prop({ type: String, required: true, immutable: true })
  last4!: string;

  /** The issuing BIN, kept so a scheme change does not orphan cards on the old range. */
  @Prop({ type: String, required: true, immutable: true })
  bin!: string;

  @Prop({ type: Number, required: true, immutable: true })
  expiryMonth!: number;

  @Prop({ type: Number, required: true, immutable: true })
  expiryYear!: number;

  @Prop({ type: String, required: true, immutable: true })
  currency!: string;

  @Prop({ type: CardControlsSchema, required: true })
  controls!: CardControlsSchemaClass;

  /** Set on a virtual card pinned to one merchant, so a leaked number buys nothing else. */
  @Prop({ type: String, default: null })
  lockedMerchantId!: string | null;

  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;

  /** Argon2 digest of the PIN. Never returned, never logged, never decryptable. */
  @Prop({ type: String, default: null })
  pinHash!: string | null;

  @Prop({ type: Number, default: 0 })
  pinAttempts!: number;

  @Prop({ type: Date, default: null })
  pinLockedUntil!: Date | null;

  @Prop({ type: String, default: null })
  replacesCardId!: string | null;

  @Prop({ type: String, default: null })
  replacedByCardId!: string | null;

  /** Why the card left circulation: the reason the customer gave when they reported it. */
  @Prop({ type: String, default: null })
  reportedReason!: string | null;

  @Prop({ type: Date, required: true, immutable: true })
  orderedAt!: Date;

  @Prop({ type: Date, default: null })
  printedAt!: Date | null;

  @Prop({ type: Date, default: null })
  shippedAt!: Date | null;

  @Prop({ type: Date, default: null })
  deliveredAt!: Date | null;

  @Prop({ type: Date, default: null })
  activatedAt!: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt!: Date | null;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type CardDocument = HydratedDocument<CardSchemaClass>;

export const CardSchema = SchemaFactory.createForClass(CardSchemaClass);

/** The card wall: one customer's cards, newest first. */
CardSchema.index({ userId: 1, orderedAt: -1 });

/** Cards on an account, for the account view and the closure guard. */
CardSchema.index({ accountId: 1, status: 1 });

/** The expiry sweep: live cards whose validity has run out. */
CardSchema.index({ expiresAt: 1, status: 1 });
