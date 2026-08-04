import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import {
  BASE_SCHEMA_OPTIONS,
  optionalMoneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { LIMIT_OVERRIDES_COLLECTION } from './limits.constants.js';

/**
 * A stored limit override.
 *
 * Overrides are append-only in spirit: a grant is never edited and never deleted, it is
 * superseded by a newer grant or ended by `revokedAt`. The audit trail of "who let this
 * customer exceed their tier cap, and when did it stop" is then just the collection
 * itself, in creation order, rather than a log that has to be trusted separately.
 *
 * Expiry is a comparison at evaluation time (`expiresAt > now`), not a TTL index —
 * a TTL would delete the record of the grant, which is the one part compliance wants
 * to keep.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: LIMIT_OVERRIDES_COLLECTION })
export class LimitOverrideSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, index: true })
  accountId!: string;

  /** The product limit scope this override speaks for, e.g. `cardSpend`. */
  @Prop({ required: true, type: String })
  scope!: string;

  /** `ANY` for all channels of the scope, or one card channel. */
  @Prop({ required: true, type: String })
  channel!: string;

  /** Every money cap on the override shares this ISO-4217 currency. */
  @Prop({ required: true, type: String, length: 3 })
  currency!: string;

  @Prop(optionalMoneyProp)
  perTransaction!: { amount: string; currency: string } | null;

  @Prop(optionalMoneyProp)
  daily!: { amount: string; currency: string } | null;

  @Prop(optionalMoneyProp)
  monthly!: { amount: string; currency: string } | null;

  @Prop({ required: false, type: Number, default: null })
  dailyCount!: number | null;

  /** Why the grant was made, in the admin's own words. Shown to investigators. */
  @Prop({ required: true, type: String })
  reason!: string;

  /** The instant the override stops applying. Compared, never scheduled. */
  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  /** Set when staff end the grant early. Null while the override can still apply. */
  @Prop({ required: false, type: Date, default: null })
  revokedAt!: Date | null;

  /** Public id (`adm_…`) of the admin who granted the override. */
  @Prop({ required: true, type: String })
  createdBy!: string;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type LimitOverrideDocument = HydratedDocument<LimitOverrideSchemaClass>;

export const LimitOverrideSchema = SchemaFactory.createForClass(LimitOverrideSchemaClass);

// The query the engine runs on every check: live overrides for one account and scope.
LimitOverrideSchema.index(
  { accountId: 1, scope: 1, revokedAt: 1, expiresAt: 1 },
  { name: 'live_overrides' },
);
