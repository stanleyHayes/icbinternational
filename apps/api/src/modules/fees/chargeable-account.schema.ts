import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { AccountStatus } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS } from '../../database/schema.helpers.js';
import { ACCOUNT_COLLECTION } from '../accounts/index.js';

/**
 * A read-only window onto the accounts collection, holding exactly what the maintenance
 * sweep needs and nothing else.
 *
 * This exists because `AccountStore` offers no whole-population scan and the accounts
 * lane is owned by another task: rather than editing it, this module registers a second
 * model over the same collection (the gl module's read models over the ledger set the
 * precedent) and never writes through it.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ACCOUNT_COLLECTION, id: false })
export class ChargeableAccountSchemaClass {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true, enum: Object.values(AccountStatus) })
  status!: AccountStatus;

  @Prop({ type: String, required: true })
  currency!: string;

  @Prop({ type: String, required: true })
  productCode!: string;

  @Prop({ type: Number, required: true })
  productVersion!: number;

  @Prop({ type: Date, required: true })
  openedAt!: Date;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;
}

export const ChargeableAccountSchema = SchemaFactory.createForClass(ChargeableAccountSchemaClass);

/**
 * Account states a maintenance fee may be charged against.
 *
 * `ACTIVE` and `DORMANT` both accept postings — dormancy is housekeeping, not a
 * restriction. Frozen and closing accounts reject debits at the ledger's posting rules,
 * so scanning them would only manufacture a failure per account per sweep.
 */
export const CHARGEABLE_STATUSES: readonly AccountStatus[] = [
  AccountStatus.ACTIVE,
  AccountStatus.DORMANT,
];
