import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { CustomerSegment, MfaMethod, UserStatus } from '@reliance/contracts';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../../../database/schema.helpers.js';

/** Tier 0 is an unverified sign-up; tier 3 is a fully verified customer. */
const MAX_KYC_TIER = 3;
const CURRENCY_CODE_LENGTH = 3;

/**
 * Multi-factor enrolment state.
 *
 * `totpSecret` is stored encrypted, never in plaintext: a database dump must not be enough
 * to mint valid codes for every customer. `recoveryCodeHashes` holds hashes only, so a
 * dump cannot be replayed either, and a code is consumed by deleting its hash.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class UserMfa {
  /** AES-256-GCM ciphertext of the base32 TOTP secret. Null until enrolment starts. */
  @Prop({ type: String, default: null, select: false })
  totpSecret!: string | null;

  /** True only after a generated code has been confirmed — an unconfirmed secret is not MFA. */
  @Prop({ type: Boolean, default: false })
  enrolled!: boolean;

  /** Argon2id hashes of the single-use recovery codes. Consumed by removal. */
  @Prop({ type: [String], default: [], select: false })
  recoveryCodeHashes!: string[];

  /** Factors the customer can actually present, in the contract's vocabulary. */
  @Prop({ type: [String], enum: Object.values(MfaMethod), default: [] })
  methods!: MfaMethod[];

  @Prop({ type: Date, default: null })
  enrolledAt!: Date | null;

  /**
   * Highest TOTP time step already accepted.
   *
   * RFC 6238 codes stay valid for a whole period, so without this a code observed over the
   * customer's shoulder could be replayed for the rest of its window. Refusing any step at
   * or below the last accepted one makes every code exactly single-use.
   */
  @Prop({ type: Number, default: null })
  lastTimeStep!: number | null;
}

export const UserMfaSchema = SchemaFactory.createForClass(UserMfa);

/**
 * The customer identity record.
 *
 * Credentials and MFA material live on the user document rather than in a side collection
 * because every authentication decision needs them together in a single read; splitting
 * them would double the round trips on the hottest path in the system and open a window
 * where the two halves disagree.
 *
 * The secret fields are `select: false`. A query has to ask for them by name, so no caller
 * can leak a password hash simply by forgetting to project it away.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: 'users' })
export class User {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: Boolean, default: false })
  emailVerified!: boolean;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  /**
   * When the password last changed.
   *
   * Reset links are keyed to this instant, which is what makes a used link stop working
   * without keeping a table of spent tokens.
   */
  @Prop({ type: Date, required: true })
  passwordChangedAt!: Date;

  @Prop({ type: String, default: null })
  phone!: string | null;

  @Prop({ type: Boolean, default: false })
  phoneVerified!: boolean;

  @Prop({ type: String, required: true, trim: true })
  firstName!: string;

  @Prop({ type: String, required: true, trim: true })
  lastName!: string;

  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING_VERIFICATION,
    index: true,
  })
  status!: UserStatus;

  @Prop({ type: String, enum: Object.values(CustomerSegment), default: CustomerSegment.PERSONAL })
  segment!: CustomerSegment;

  @Prop({ type: Number, min: 0, max: MAX_KYC_TIER, default: 0 })
  kycTier!: number;

  @Prop({ type: UserMfaSchema, default: () => ({}) })
  mfa!: UserMfa;

  @Prop({ type: String, default: 'en-GB' })
  locale!: string;

  @Prop({ type: String, length: CURRENCY_CODE_LENGTH, required: true })
  baseCurrency!: string;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  /** Consecutive failures since the last success. Reset to zero on every successful login. */
  @Prop({ type: Number, default: 0 })
  failedLoginAttempts!: number;

  /** Set when the failure budget is exhausted; login is refused until it passes. */
  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  marketingOptIn!: boolean;

  @Prop({ type: Date, required: true })
  termsAcceptedAt!: Date;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

/**
 * Unique only across actual phone numbers.
 *
 * A sparse index still indexes documents where the field is present and `null` — and this
 * schema stores `null`, not a missing field — so every second registration without a
 * phone collided on it. The partial filter restricts the index to real strings, which is
 * what "unique among customers who have a phone" actually means.
 */
UserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);
