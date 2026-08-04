/**
 * The upload-ticket collection.
 *
 * `storageKey` is unique and is the document's natural key — there is exactly one ticket
 * per signed key, and a second issue for the same key would mean the provider handed the
 * same address to two customers.
 *
 * There is no public prefixed id here on purpose: a ticket is never addressed by a client,
 * only quoted back as the storage key it was issued for.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../database/schema.helpers.js';

import {
  AssetPurpose,
  UPLOAD_TICKET_COLLECTION,
  UPLOAD_TICKET_RETENTION_SECONDS,
  type AssetPurpose as AssetPurposeType,
} from './files.constants.js';

@Schema({ ...BASE_SCHEMA_OPTIONS, collection: UPLOAD_TICKET_COLLECTION, id: false })
export class UploadTicketSchemaClass {
  @Prop({ type: String, required: true, unique: true, immutable: true })
  storageKey!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  ownerId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(AssetPurpose) })
  purpose!: AssetPurposeType;

  @Prop({ type: Date, required: true, immutable: true })
  issuedAt!: Date;

  @Prop({ type: Date, required: true, immutable: true })
  expiresAt!: Date;

  /** When the ticket was spent by a confirm. Null while it is still claimable. */
  @Prop({ type: Date, default: null })
  claimedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type UploadTicketDocument = HydratedDocument<UploadTicketSchemaClass>;

export const UploadTicketSchema = SchemaFactory.createForClass(UploadTicketSchemaClass);

/**
 * Retention, expressed as a TTL measured from expiry rather than from issue.
 *
 * The row is useless to a customer the moment it expires, but it is the only evidence of
 * who was authorised to store the object a dispute is about, so it outlives its usefulness
 * by a wide margin before Mongo reaps it.
 */
UploadTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: UPLOAD_TICKET_RETENTION_SECONDS });
