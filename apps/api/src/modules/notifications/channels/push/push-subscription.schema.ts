import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../../database/schema.helpers.js';
import { PUSH_SUBSCRIPTION_COLLECTION } from '../../notifications.constants.js';

/**
 * One browser's push subscription.
 *
 * `p256dh` and `auth` are the browser's own key material, not ours. They are the reason we
 * cannot read a payload once it has been encrypted, and they are useless to an attacker
 * without the endpoint's cooperation — but they are still key material, so the collection
 * is never projected into an admin view.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: PUSH_SUBSCRIPTION_COLLECTION, id: false })
export class PushSubscriptionSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, unique: true })
  endpoint!: string;

  @Prop({ type: String, required: true })
  p256dh!: string;

  @Prop({ type: String, required: true })
  auth!: string;

  @Prop({ type: String, required: false, default: null })
  deviceLabel!: string | null;

  @Prop({ type: Date, required: false, default: null })
  lastUsedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PushSubscriptionDocument = HydratedDocument<PushSubscriptionSchemaClass>;
export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscriptionSchemaClass);
