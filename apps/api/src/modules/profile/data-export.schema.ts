/**
 * Persistence shape of a subject-access copy.
 *
 * Two things are stored and they have very different sensitivities. The request — who
 * asked, when, for what — is workflow metadata and sits in the clear, because the bank has
 * to be able to show it answered inside the statutory window without decrypting anything.
 * The gathered data is the densest personal record the bank ever assembles about one
 * person, and it sits sealed under `SecretCipher` in a single field.
 *
 * `expiresAt` carries a TTL index. A copy nobody collected stops existing rather than
 * sitting in a collection forever, which is the only storage policy that ages well for a
 * record like this.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import { DATA_EXPORT_COLLECTION } from './profile.constants.js';

/** Where a copy is in its life. Mirrors the client's `AsyncArtefactStatus`. */
export const DataExportStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type DataExportStatus = (typeof DataExportStatus)[keyof typeof DataExportStatus];

/** One customer's request for a copy of what the bank holds. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: DATA_EXPORT_COLLECTION, id: false })
export class DataExportSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  userId!: string;

  @Prop({ type: String, enum: Object.values(DataExportStatus), required: true, index: true })
  status!: DataExportStatus;

  /** Categories actually gathered, so the customer can see what they are being given. */
  @Prop({ type: [String], default: [] })
  includes!: string[];

  @Prop({ type: String, enum: ['JSON', 'CSV', 'ZIP'], required: true })
  format!: string;

  /** The gathered data. Ciphertext; see `data-export.assembler.ts` for what is in it. */
  @Prop({ type: String, default: '' })
  payload!: string;

  /** Set only once the copy has been packaged and a link exists to hand over. */
  @Prop({ type: String, default: null })
  downloadUrl!: string | null;

  @Prop({ type: Date, default: null })
  readyAt!: Date | null;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DataExportDocument = HydratedDocument<DataExportSchemaClass>;

export const DataExportSchema = SchemaFactory.createForClass(DataExportSchemaClass);

/**
 * Mongo reaps the copy when it lapses.
 *
 * A TTL index rather than a sweep job: the retention promise made to the customer is then
 * enforced by the database itself, and it keeps being enforced whether or not anybody
 * remembers to schedule the sweep.
 */
DataExportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** The customer's own list, newest first. */
DataExportSchema.index({ userId: 1, createdAt: -1 });
