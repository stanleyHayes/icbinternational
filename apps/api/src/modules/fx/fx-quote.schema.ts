import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type CurrencyCode } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { FX_QUOTE_COLLECTION, FX_QUOTE_RETENTION_DAYS } from './fx.constants.js';

const SECONDS_PER_DAY = 86_400;
const CURRENCY_CODE_LENGTH = 3;

/**
 * A price the bank has committed to, and the conversion that spent it.
 *
 * One document rather than two. A quote and its execution are the same commercial event
 * seen at two moments, and splitting them would create the possibility of a conversion
 * whose quote cannot be found — the one artefact an auditor asking "why did this customer
 * get this rate?" actually needs.
 *
 * **`conversionId` is unique when set.** Two authorisations racing on one quote are
 * separated by the conditional update in the repository; the index is the independent
 * backstop, so even a code path that forgot the condition cannot book a second conversion
 * against the same price.
 *
 * The document is reaped {@link FX_QUOTE_RETENTION_DAYS} after it was created. The journal
 * entry is permanent; this is the working paper behind it, and a quote nobody executed
 * three months ago is not evidence of anything.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: FX_QUOTE_COLLECTION, id: false })
export class FxQuoteSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, immutable: true, length: CURRENCY_CODE_LENGTH })
  from!: CurrencyCode;

  @Prop({ type: String, required: true, immutable: true, length: CURRENCY_CODE_LENGTH })
  to!: CurrencyCode;

  @Prop({ type: String, required: true, immutable: true })
  fromAccountId!: string;

  @Prop({ type: String, required: true, immutable: true })
  toAccountId!: string;

  @Prop(moneyProp)
  sellAmount!: StoredMoney;

  @Prop(moneyProp)
  buyAmount!: StoredMoney;

  /** The all-in rate the customer was shown, as a decimal string. Never a float. */
  @Prop({ type: String, required: true, immutable: true })
  rate!: string;

  @Prop({ type: String, required: true, immutable: true })
  midRate!: string;

  @Prop({ type: Number, required: true, immutable: true })
  spreadBps!: number;

  @Prop(moneyProp)
  spreadCost!: StoredMoney;

  @Prop(moneyProp)
  fee!: StoredMoney;

  /** After this instant the price is gone and the customer is re-quoted, never repriced. */
  @Prop({ type: Date, required: true, immutable: true })
  expiresAt!: Date;

  /** The conversion that spent this quote. Null while it is still executable. */
  @Prop({ type: String, default: null, unique: true, sparse: true })
  conversionId!: string | null;

  @Prop({ type: String, default: null })
  journalEntryId!: string | null;

  @Prop({ type: Date, default: null })
  executedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type FxQuoteDocument = HydratedDocument<FxQuoteSchemaClass>;

export const FxQuoteSchema = SchemaFactory.createForClass(FxQuoteSchemaClass);

/** The customer's conversion history, newest first. */
FxQuoteSchema.index({ userId: 1, executedAt: -1 });

/** Working papers expire; the journal entry they explain does not. */
FxQuoteSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: FX_QUOTE_RETENTION_DAYS * SECONDS_PER_DAY },
);
