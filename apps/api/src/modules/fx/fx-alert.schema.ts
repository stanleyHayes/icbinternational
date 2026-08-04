import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type CurrencyCode } from '@reliance/money';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import { type AlertDirection } from './fx-alert.store.js';
import { FX_ALERT_COLLECTION } from './fx.constants.js';

const CURRENCY_CODE_LENGTH = 3;
const DIRECTIONS: readonly AlertDirection[] = ['ABOVE', 'BELOW'];

/**
 * A level a customer is watching for.
 *
 * The target is stored as a decimal *string*, not a number. A rate is compared for
 * crossing, and a comparison against a float that arrived as `1.1699999999999999` fires a
 * notification the customer will not be able to reconcile with the board they were looking
 * at. Parsing happens once, into the same scaled integer the feed produces.
 *
 * A fired alert is kept rather than deleted. "You told me when the euro hit 1.17" is a
 * claim the customer may want to check, and an alert that erases itself on firing leaves
 * nothing to check it against.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: FX_ALERT_COLLECTION, id: false })
export class FxAlertSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, immutable: true, length: CURRENCY_CODE_LENGTH })
  from!: CurrencyCode;

  @Prop({ type: String, required: true, immutable: true, length: CURRENCY_CODE_LENGTH })
  to!: CurrencyCode;

  @Prop({ type: String, required: true, immutable: true, enum: DIRECTIONS })
  direction!: AlertDirection;

  @Prop({ type: String, required: true, immutable: true })
  targetRate!: string;

  @Prop({ type: Boolean, required: true, default: true, index: true })
  active!: boolean;

  @Prop({ type: Date, default: null })
  triggeredAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type FxAlertDocument = HydratedDocument<FxAlertSchemaClass>;

export const FxAlertSchema = SchemaFactory.createForClass(FxAlertSchemaClass);

/** The customer's own list, newest first. */
FxAlertSchema.index({ userId: 1, createdAt: -1 });

/** The sweep's read: everything still armed, grouped by the pair it watches. */
FxAlertSchema.index({ active: 1, from: 1, to: 1 });
