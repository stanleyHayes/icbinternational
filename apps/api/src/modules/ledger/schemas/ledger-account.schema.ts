import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { LedgerAccountType } from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  StoredMoneySchema,
  publicIdProp,
} from '../../../database/schema.helpers.js';
import { GL_CODE_PATTERN, LEDGER_ACCOUNT_COLLECTION } from '../ledger.constants.js';

/**
 * A general-ledger account — one row of the chart of accounts.
 *
 * `balances` is a projection, never a source of truth: every value in it is reproducible
 * by replaying postings from zero, which is exactly what `LedgerVerifierService` does.
 * Storing it at all is a performance decision, and the verifier is the price of that
 * decision being safe.
 *
 * The map is keyed by ISO 4217 code because one GL account genuinely holds several
 * currencies — `2000 Customer Deposits` owes GBP, USD and EUR simultaneously, and summing
 * them into a single figure would be meaningless. Each currency balances independently.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: LEDGER_ACCOUNT_COLLECTION, id: false })
export class LedgerAccountSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, unique: true, immutable: true, match: GL_CODE_PATTERN })
  code!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(LedgerAccountType),
    immutable: true,
  })
  type!: LedgerAccountType;

  /**
   * A control account aggregates many customer-facing accounts.
   *
   * `2000 Customer Deposits` is the important one: the sum of every customer balance must
   * equal its balance exactly, so a posting to it that carries no `accountId` would break
   * that identity silently. `PostingService` refuses one.
   */
  @Prop({ required: true, type: Boolean, default: false })
  isControlAccount!: boolean;

  /** Signed balance per currency, positive meaning "increased on its normal side". */
  @Prop({ required: true, type: Map, of: StoredMoneySchema, default: () => new Map() })
  balances!: Map<string, StoredMoney>;
}

export const LedgerAccountSchema = SchemaFactory.createForClass(LedgerAccountSchemaClass);

export type LedgerAccountDocument = HydratedDocument<LedgerAccountSchemaClass>;

/** The trial balance and the admin console both list by type, then by code. */
LedgerAccountSchema.index({ type: 1, code: 1 });
