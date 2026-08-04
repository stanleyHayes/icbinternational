/**
 * The file register collection.
 *
 * `storageKey` is unique: an upload confirmed twice must resolve to the one record, or a
 * customer could register the same passport scan under two document ids and defeat the
 * duplicate check the KYC lane performs on `checksum`.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import {
  AssetPurpose,
  AssetVisibility,
  FILE_ASSET_COLLECTION,
  type AssetPurpose as AssetPurposeType,
  type AssetVisibility as AssetVisibilityType,
} from './files.constants.js';

@Schema({ ...BASE_SCHEMA_OPTIONS, collection: FILE_ASSET_COLLECTION, id: false })
export class FileAssetSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: false, default: null, index: true })
  ownerId!: string | null;

  @Prop({ type: String, required: true, enum: Object.values(AssetPurpose), index: true })
  purpose!: AssetPurposeType;

  @Prop({ type: String, required: true, enum: Object.values(AssetVisibility) })
  visibility!: AssetVisibilityType;

  @Prop({ type: String, required: true, unique: true, immutable: true })
  storageKey!: string;

  @Prop({ type: String, required: true, trim: true })
  fileName!: string;

  @Prop({ type: String, required: true })
  contentType!: string;

  @Prop({ type: Number, required: true, min: 1 })
  sizeBytes!: number;

  @Prop({ type: String, required: true, index: true })
  checksum!: string;

  @Prop({ type: String, required: false, default: null })
  publicUrl!: string | null;

  @Prop({ type: Boolean, required: true, default: false })
  verified!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type FileAssetDocument = HydratedDocument<FileAssetSchemaClass>;

export const FileAssetSchema = SchemaFactory.createForClass(FileAssetSchemaClass);

FileAssetSchema.index({ ownerId: 1, purpose: 1, createdAt: -1 });
