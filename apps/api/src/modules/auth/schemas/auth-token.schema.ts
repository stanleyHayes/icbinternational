import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../../database/schema.helpers.js';
import { AuthTokenKind } from '../auth.constants.js';

/**
 * A single-use secret sent out of band — the email-verification and password-reset links.
 *
 * Only the SHA-256 of the emailed token is stored: a database read must not hand an
 * attacker live reset links, which are full credential substitutes for the hour they live.
 * SHA-256 rather than Argon2 because the token is 256 bits of generated entropy — there is
 * no dictionary to defend against.
 *
 * Rows have no public id: they are never addressed over the API, only redeemed by hash.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: 'auth_tokens' })
export class AuthToken {
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, enum: Object.values(AuthTokenKind), required: true })
  kind!: AuthTokenKind;

  /** SHA-256 of the emailed token. Unique, so one token cannot back two rows. */
  @Prop({ type: String, required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  /** Set on redemption. A consumed link can never be presented again. */
  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);

/** Spent and expired links have no security value left; MongoDB reclaims them. */
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
