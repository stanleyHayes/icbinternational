import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../database/schema.helpers.js';

/**
 * One refresh token, and therefore one link in a login's chain.
 *
 * A session row is not "a logged-in user" — it is a single refresh token instance. Every
 * refresh mints a new row and stamps `rotatedAt` on the old one, so the whole chain
 * survives in the collection until it expires. That history is what makes reuse
 * detectable: presenting a token whose row is already rotated proves the token was copied,
 * because the legitimate client discarded it the moment it received the replacement.
 *
 * All rows minted from one login share a `family`. Detecting reuse anywhere in the chain
 * revokes the family, which logs out both the thief and the victim — the only safe
 * outcome, since the server cannot tell which of the two is holding the newest token.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: 'sessions' })
export class Session {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, index: true })
  userId!: string;

  /**
   * SHA-256 of the refresh token. Unique, so the same token cannot back two rows.
   *
   * A hash rather than the token because a leaked database read must not hand the reader
   * live credentials; SHA-256 rather than Argon2 because the token is 256 bits of
   * generated entropy — there is no dictionary to slow an attacker down with.
   */
  @Prop({ type: String, required: true, unique: true })
  refreshTokenHash!: string;

  /** Shared by every token descended from one login. The unit of revocation on reuse. */
  @Prop({ type: String, required: true, index: true })
  family!: string;

  @Prop({ type: String, default: null })
  deviceId!: string | null;

  @Prop({ type: String, required: true })
  ip!: string;

  @Prop({ type: String, required: true })
  userAgent!: string;

  /** Set when this token was exchanged for its successor. Non-null means "already spent". */
  @Prop({ type: Date, default: null })
  rotatedAt!: Date | null;

  /** The row minted in this one's place, for tracing a chain in an investigation. */
  @Prop({ type: String, default: null })
  replacedBySessionId!: string | null;

  /** Set by logout, by remote revocation, or by family-wide revocation after reuse. */
  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  /** Why the row was revoked. Read by support when a customer asks "why was I logged out?". */
  @Prop({ type: String, default: null })
  revokedReason!: string | null;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);

/**
 * MongoDB removes each row once `expiresAt` passes.
 *
 * Expired rows have no security value left — a token past its expiry is refused by the
 * signature check before the database is ever consulted — and leaving them would grow the
 * busiest collection in the system without bound.
 */
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Serves the "your active sessions" list, which filters on exactly these fields. */
SessionSchema.index({ userId: 1, revokedAt: 1, rotatedAt: 1 });
