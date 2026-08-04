import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { NotificationChannel, type NotificationChannel as ChannelType } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../database/schema.helpers.js';
import { ADDRESS_HEALTH_COLLECTION, DELIVERY_COLLECTION } from '../notifications.constants.js';

import {
  AddressHealth,
  DeliveryStatus,
  type DeliveryStatus as StatusType,
} from './delivery.types.js';

/**
 * One delivery attempt sequence.
 *
 * `providerMessageId` is sparsely indexed: only rows that reached a provider have one, and
 * the webhook handler's lookup is the only reader. A dense index would carry a null entry
 * for every in-app notification, which is most of them.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: DELIVERY_COLLECTION, id: false })
export class DeliverySchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: false, default: null })
  notificationId!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  templateKey!: string;

  @Prop({ type: String, required: true, enum: Object.values(NotificationChannel) })
  channel!: ChannelType;

  @Prop({ type: String, required: true })
  destination!: string;

  @Prop({ type: String, required: true, enum: Object.values(DeliveryStatus), index: true })
  status!: StatusType;

  @Prop({ type: Number, required: true, default: 0 })
  attempts!: number;

  @Prop({ type: String, required: false, default: null, index: { sparse: true } })
  providerMessageId!: string | null;

  @Prop({ type: String, required: false, default: null })
  lastError!: string | null;

  @Prop({ type: Date, required: false, default: null })
  nextAttemptAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DeliveryDocument = HydratedDocument<DeliverySchemaClass>;
export const DeliverySchema = SchemaFactory.createForClass(DeliverySchemaClass);

// The retry sweep's only query: rows still in flight whose next attempt has come due.
DeliverySchema.index({ status: 1, nextAttemptAt: 1 });

/** How an address has been behaving, keyed by channel and destination. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ADDRESS_HEALTH_COLLECTION, id: false })
export class AddressHealthSchemaClass {
  @Prop({ type: String, required: true, enum: Object.values(NotificationChannel) })
  channel!: ChannelType;

  @Prop({ type: String, required: true })
  destination!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(AddressHealth),
    default: AddressHealth.HEALTHY,
  })
  health!: string;

  @Prop({ type: Number, required: true, default: 0 })
  bounceCount!: number;

  @Prop({ type: Number, required: true, default: 0 })
  complaintCount!: number;

  @Prop({ type: String, required: false, default: null })
  lastReason!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AddressHealthDocument = HydratedDocument<AddressHealthSchemaClass>;
export const AddressHealthSchema = SchemaFactory.createForClass(AddressHealthSchemaClass);

AddressHealthSchema.index({ channel: 1, destination: 1 }, { unique: true });
