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
 * The fields are shaped for A-05's TOTP service — `totpSecret` holds the
 * `SecretCipher`-encrypted seed, never plaintext — but enrolment and verification are
 * A-05's to build. This module only reads `enrolled`: a token is not issuable to an
 * admin who has not completed TOTP enrolment.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class AdminMfaSchemaClass {
  @Prop({ type: String, required: false, default: null, select: false })
  totpSecret!: string | null;

  /** Simulated-clock instant TOTP enrolment completed. Null until it does. */
  @Prop({ type: Date, required: false, default: null })
  enrolledAt!: Date | null;
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

  @Prop({ type: String, required: true, unique: true, index: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  fullName!: string;

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
