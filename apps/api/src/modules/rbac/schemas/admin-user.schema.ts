import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../../database/schema.helpers.js';
import { ADMIN_USER_COLLECTION } from '../rbac.constants.js';

/**
 * Second-factor state, embedded so it never travels without its admin.
 *
 * `totpSecret` holds the `SecretCipher`-encrypted seed, never plaintext, and is
 * `select: false` so only the login lookup ever reads it. A second factor is mandatory
 * for staff: `AdminLoginService` refuses an account whose `enrolledAt` is null rather
 * than falling back to a password-only session.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class AdminMfaSchemaClass {
  @Prop({ type: String, required: false, default: null, select: false })
  totpSecret!: string | null;

  /** Simulated-clock instant TOTP enrolment completed. Null until it does. */
  @Prop({ type: Date, required: false, default: null })
  enrolledAt!: Date | null;

  /**
   * Highest RFC 6238 time step already spent.
   *
   * A code stays mathematically valid for its whole period, so without recording the step
   * a code read over an operator's shoulder is usable again seconds later. The login path
   * advances this with a conditional write, which also settles the concurrent race.
   */
  @Prop({ type: Number, required: false, default: null })
  lastTimeStep!: number | null;
}

export const AdminMfaSchema = SchemaFactory.createForClass(AdminMfaSchemaClass);

/**
 * A staff account.
 *
 * Authorisation data is split deliberately: `roles` names the bundles, `grants` holds
 * the per-person exceptions on top of them. Effective permissions are computed, never
 * stored, so a role re-bundle cannot leave a stale copy behind on the user row.
 *
 * `ipAllowlist` is per-admin rather than global: treasury staff can be pinned to the
 * office network without forcing support agents — who may roam — through the same list.
 * An empty list means unrestricted; the guard documents and tests that choice.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ADMIN_USER_COLLECTION })
export class AdminUserDocument {
  @Prop(publicIdProp)
  id!: string;

  /**
   * Uniqueness is declared once, on the named index at the foot of this file. Declaring
   * it here too asked Mongo to build the same key under two names, which it refuses —
   * and the refusal only surfaces when something actually waits for the index build.
   */
  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  fullName!: string;

  /**
   * Argon2id digest of the sign-in password, or null on an account whose holder has not
   * been given one yet.
   *
   * `select: false`, like the TOTP seed: a staff row read for any other purpose — the
   * console's user list, the guard's per-request resolution — comes back without it. Null
   * is not a bypass; login treats it exactly as it treats a wrong password.
   */
  @Prop({ type: String, required: false, default: null, select: false })
  passwordHash!: string | null;

  /** Contract `AdminRole` values. Strings in storage; the catalogue validates on read. */
  @Prop({ type: [String], required: true, default: [] })
  roles!: string[];

  /** Contract `Permission` values granted on top of the role bundles, person by person. */
  @Prop({ type: [String], required: true, default: [] })
  grants!: string[];

  /** An inactive admin is rejected at the guard even with a perfectly valid token. */
  @Prop({ type: Boolean, required: true, default: true })
  active!: boolean;

  @Prop({ type: AdminMfaSchema, required: true, default: () => ({}) })
  mfa!: AdminMfaSchemaClass;

  /** Exact client IPs this admin may connect from. Empty means unrestricted. */
  @Prop({ type: [String], required: true, default: [] })
  ipAllowlist!: string[];

  @Prop({ type: Date, required: false, default: null })
  lastLoginAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AdminUserDoc = HydratedDocument<AdminUserDocument>;

export const AdminUserSchema = SchemaFactory.createForClass(AdminUserDocument);

// "Sign in as" and the console's staff list both start from email.
AdminUserSchema.index({ email: 1 }, { unique: true, name: 'admin_email_unique' });
