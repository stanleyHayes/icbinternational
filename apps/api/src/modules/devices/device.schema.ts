import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { DeviceTrust } from '@reliance/contracts';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../database/schema.helpers.js';

/**
 * A WebAuthn credential registered from this device.
 *
 * Embedded on the device rather than in a side collection because a passkey is useless
 * without the trust record it lives under, and the pair is always read together. The
 * credential id — base64url, minted by the authenticator — doubles as the passkey's
 * public id; it is already globally unique and unguessable, so a second identifier would
 * add a mapping without adding anything.
 *
 * The public key is not a secret (it can only verify signatures, never make them), so it
 * is stored plain; the *private* key never leaves the authenticator at all.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class DevicePasskey {
  /** Base64url credential id from the authenticator. The passkey's public identifier. */
  @Prop({ type: String, required: true })
  credentialId!: string;

  /** Base64url COSE public key, used to verify assertions from this credential. */
  @Prop({ type: String, required: true })
  publicKey!: string;

  /** Signature counter — a replayed authenticator reports a lower value than stored. */
  @Prop({ type: Number, default: 0 })
  counter!: number;

  @Prop({ type: String, required: true })
  label!: string;

  /** Authenticator attestation GUID, when the authenticator disclosed one. */
  @Prop({ type: String, default: null })
  aaguid!: string | null;

  @Prop({ type: [String], default: [] })
  transports!: string[];

  @Prop({ type: Boolean, default: false })
  backedUp!: boolean;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;
}

export const DevicePasskeySchema = SchemaFactory.createForClass(DevicePasskey);

/**
 * A browser or app installation the customer has signed in from.
 *
 * The fingerprint is a client-supplied hint, not an identity. It is good enough to say
 * "we have seen this browser before, so do not challenge again" and nowhere near good
 * enough to authenticate with, because anything the client computes the client can also
 * copy. Trust therefore only ever *reduces* friction; it never grants access on its own.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: 'devices' })
export class Device {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, index: true })
  userId!: string;

  /** Stable per-browser hash supplied at login. Unique within one customer, not globally. */
  @Prop({ type: String, required: true })
  fingerprint!: string;

  /** Human-readable name shown in the security screen, derived from the user agent. */
  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: String, required: true })
  platform!: string;

  @Prop({
    type: String,
    enum: Object.values(DeviceTrust),
    default: DeviceTrust.UNKNOWN,
  })
  trust!: DeviceTrust;

  @Prop({ type: Boolean, default: false })
  hasPasskey!: boolean;

  /** Passkeys registered from this device. `hasPasskey` is the cheap flag over this list. */
  @Prop({ type: [DevicePasskeySchema], default: [] })
  passkeys!: DevicePasskey[];

  @Prop({ type: Date, required: true })
  firstSeenAt!: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DeviceDocument = HydratedDocument<Device>;

export const DeviceSchema = SchemaFactory.createForClass(Device);

/**
 * Unique per customer rather than globally: two people on the same shared machine produce
 * the same fingerprint, and each needs their own trust record for it.
 */
DeviceSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
