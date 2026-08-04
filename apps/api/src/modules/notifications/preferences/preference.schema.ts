import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import { type ChannelPreference } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS } from '../../../database/schema.helpers.js';
import { DEFAULT_TIMEZONE, PREFERENCE_COLLECTION } from '../notifications.constants.js';

/**
 * A customer's notification preferences.
 *
 * `preferences` is stored as an opaque array rather than decomposed into ten boolean
 * quartets. The category list belongs to the contract and will grow; a document shape that
 * enumerates today's categories would need a migration every time it does, and the array
 * is never queried by its contents — it is read whole, for one customer, at delivery time.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: PREFERENCE_COLLECTION, id: false })
export class PreferenceSchemaClass {
  @Prop({ type: String, required: true, unique: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: [] })
  preferences!: ChannelPreference[];

  @Prop({ type: SchemaTypes.Mixed, required: false, default: null })
  quietHours!: { from: string; to: string } | null;

  @Prop({ type: String, required: true, default: DEFAULT_TIMEZONE })
  timezone!: string;

  @Prop({ type: [String], required: true, default: [] })
  digestEnabledCategories!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type PreferenceDocument = HydratedDocument<PreferenceSchemaClass>;

export const PreferenceSchema = SchemaFactory.createForClass(PreferenceSchemaClass);
