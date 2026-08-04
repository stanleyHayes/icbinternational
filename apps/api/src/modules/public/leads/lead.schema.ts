import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../database/schema.helpers.js';
import { LEAD_COLLECTION } from '../public.constants.js';

import { LeadKind, type LeadKind as KindType } from './lead.store.js';

/**
 * An enquiry or a newsletter sign-up.
 *
 * No reference to a user, an account or anything else. That absence is the point: a lead
 * is a person who is not a customer, and the collection is structurally incapable of
 * joining to one.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: LEAD_COLLECTION, id: false })
export class LeadSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, enum: Object.values(LeadKind), index: true })
  kind!: KindType;

  @Prop({ type: String, required: false, default: null, trim: true })
  name!: string | null;

  @Prop({ type: String, required: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ type: String, required: false, default: null, trim: true })
  phone!: string | null;

  @Prop({ type: String, required: false, default: null })
  interest!: string | null;

  @Prop({ type: String, required: false, default: null })
  message!: string | null;

  @Prop({ type: String, required: false, default: null })
  sourceIp!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type LeadDocument = HydratedDocument<LeadSchemaClass>;
export const LeadSchema = SchemaFactory.createForClass(LeadSchemaClass);

LeadSchema.index({ email: 1, kind: 1, createdAt: -1 });
