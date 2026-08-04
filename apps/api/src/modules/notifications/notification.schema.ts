import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import {
  NotificationCategory,
  NotificationSeverity,
  type NotificationCategory as CategoryType,
  type NotificationSeverity as SeverityType,
} from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import { NOTIFICATION_COLLECTION } from './notifications.constants.js';

/**
 * One entry in a customer's notification centre.
 *
 * The compound index is `{userId, createdAt, id}` in that order, which is exactly the
 * cursor the list endpoint pages on. Adding `read` to it was considered and rejected: the
 * unread filter is highly selective for a customer with a clean centre and almost useless
 * for one with a thousand unread items, so a second index would be maintained on every
 * write to help the case that is already fast.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: NOTIFICATION_COLLECTION, id: false })
export class NotificationSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, enum: Object.values(NotificationCategory) })
  category!: CategoryType;

  @Prop({ type: String, required: true, enum: Object.values(NotificationSeverity) })
  severity!: SeverityType;

  @Prop({ type: String, required: true, immutable: true })
  templateKey!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  body!: string;

  @Prop({ type: String, required: false, default: null })
  actionUrl!: string | null;

  @Prop({ type: String, required: false, default: null })
  actionLabel!: string | null;

  @Prop({ type: String, required: false, default: null })
  iconKey!: string | null;

  @Prop({ type: Boolean, required: true, default: false })
  read!: boolean;

  @Prop({ type: Date, required: false, default: null })
  readAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type NotificationDocument = HydratedDocument<NotificationSchemaClass>;

export const NotificationSchema = SchemaFactory.createForClass(NotificationSchemaClass);

NotificationSchema.index({ userId: 1, createdAt: -1, id: -1 });
