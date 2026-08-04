import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../../database/schema.helpers.js';
import { DIGEST_COLLECTION } from '../notifications.constants.js';

/** A customer's open digest bucket. One per customer at a time. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: DIGEST_COLLECTION, id: false })
export class DigestSchemaClass {
  @Prop({ type: String, required: true, unique: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: [] })
  items!: { summary: string; at: Date }[];

  @Prop({ type: Date, required: true, index: true })
  dueAt!: Date;

  @Prop({ type: Date, required: true })
  openedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DigestDocument = HydratedDocument<DigestSchemaClass>;
export const DigestSchema = SchemaFactory.createForClass(DigestSchemaClass);
