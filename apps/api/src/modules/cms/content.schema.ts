import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { PublishStatus, type PublishStatus as StatusType, type Seo } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import {
  ContentKind,
  CONTENT_COLLECTION,
  REVISION_COLLECTION,
  type ContentKind as KindType,
} from './cms.constants.js';

/**
 * A content document of any kind.
 *
 * Coordinates are stored as integer microdegrees rather than as floats. A branch's position
 * is fixed data with six decimal places of meaningful precision — roughly a tenth of a
 * metre — and an integer is exact, sorts and indexes cleanly, and keeps this file inside
 * the house rule that bans floating-point literals in the banking core.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: CONTENT_COLLECTION, id: false })
export class ContentSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(ContentKind),
    index: true,
  })
  kind!: KindType;

  @Prop({ type: String, required: true, immutable: true, trim: true })
  slug!: string;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, required: true, enum: Object.values(PublishStatus), index: true })
  status!: StatusType;

  @Prop({ type: String, required: true, default: 'en-GB' })
  locale!: string;

  @Prop({ type: SchemaTypes.Mixed, required: false, default: null })
  seo!: Seo | null;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ type: [String], required: true, default: [], index: true })
  tags!: string[];

  @Prop({ type: Number, required: true, default: 0 })
  order!: number;

  @Prop({ type: Number, required: false, default: null })
  latitudeMicro!: number | null;

  @Prop({ type: Number, required: false, default: null })
  longitudeMicro!: number | null;

  @Prop({ type: Date, required: false, default: null, index: true })
  scheduledFor!: Date | null;

  @Prop({ type: Date, required: false, default: null })
  publishedAt!: Date | null;

  @Prop({ type: Number, required: true, default: 1 })
  revision!: number;

  @Prop({ type: String, required: false, default: null })
  updatedBy!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ContentDocument = HydratedDocument<ContentSchemaClass>;
export const ContentSchema = SchemaFactory.createForClass(ContentSchemaClass);

// A slug is unique within its kind, not globally: a page and a blog post may both be
// `/savings` without ambiguity, because the two are served from different routes.
ContentSchema.index({ kind: 1, slug: 1 }, { unique: true });
ContentSchema.index({ kind: 1, status: 1, order: 1, publishedAt: -1 });
// The locator's bounding-box query. Latitude first — it is the more selective of the two
// for a country-shaped dataset.
ContentSchema.index({ kind: 1, status: 1, latitudeMicro: 1, longitudeMicro: 1 });

/** A point-in-time copy of a document, written before every change. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: REVISION_COLLECTION, id: false })
export class RevisionSchemaClass {
  @Prop({ type: String, required: true, immutable: true, index: true })
  documentId!: string;

  @Prop({ type: Number, required: true, immutable: true })
  revision!: number;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true, enum: Object.values(PublishStatus) })
  status!: StatusType;

  @Prop({ type: SchemaTypes.Mixed, required: false, default: null })
  seo!: Seo | null;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ type: [String], required: true, default: [] })
  tags!: string[];

  @Prop({ type: String, required: false, default: null })
  savedBy!: string | null;

  @Prop({ type: Date, required: true })
  savedAt!: Date;

  @Prop({ type: String, required: false, default: null })
  note!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type RevisionDocument = HydratedDocument<RevisionSchemaClass>;
export const RevisionSchema = SchemaFactory.createForClass(RevisionSchemaClass);

RevisionSchema.index({ documentId: 1, revision: -1 }, { unique: true });
