import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import {
  EntryType,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  moneyProp,
  optionalMoneyProp,
  publicIdProp,
} from '../../../database/schema.helpers.js';
import { TRANSACTION_COLLECTION, TRANSACTION_TEXT_INDEX } from '../transactions.constants.js';

import { CounterpartySchema, type CounterpartySchemaClass } from './counterparty.schema.js';

/**
 * The customer-facing projection of one side of a journal entry.
 *
 * This is not the system of record and must never be treated as one: every field that
 * carries money originates in `journal_entries` and can be rebuilt from it. What lives
 * here that does not live there is the human layer — a category, a counterparty logo, the
 * customer's own note — plus `runningBalance`, which is a materialised answer to "what
 * was my balance right after this?" that would otherwise cost a replay of the account's
 * whole history to answer.
 *
 * `accountId` + `journalEntryId` is unique. That single index is the entire idempotency
 * guarantee for the projector: a replayed entry cannot produce a second row on the same
 * account no matter how many times, or from how many processes, it is projected.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: TRANSACTION_COLLECTION, id: false })
export class TransactionSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, immutable: true })
  accountId!: string;

  /** The entry this row projects. Immutable — a row never changes which event it describes. */
  @Prop({ required: true, type: String, immutable: true })
  journalEntryId!: string;

  /**
   * Denormalised owner of `accountId`.
   *
   * Stored so the "all my transactions" feed is one indexed query rather than a lookup of
   * every account the customer holds followed by an `$in` over a growing list. Accounts
   * do not change hands, so there is no update path to keep consistent.
   */
  @Prop({ required: true, type: String, immutable: true })
  userId!: string;

  @Prop({ required: true, type: String, enum: Object.values(TransactionDirection) })
  direction!: TransactionDirection;

  @Prop({ required: true, type: String, enum: Object.values(TransactionStatus) })
  status!: TransactionStatus;

  @Prop({ required: true, type: String, enum: Object.values(EntryType), immutable: true })
  type!: EntryType;

  /** Always positive; `direction` carries the sign, exactly as a ledger posting does. */
  @Prop(moneyProp)
  amount!: StoredMoney;

  /** Signed balance on this account immediately after the posting. Overdrafts go negative. */
  @Prop(moneyProp)
  runningBalance!: StoredMoney;

  @Prop(optionalMoneyProp)
  originalAmount!: StoredMoney | null;

  /** Decimal string, never a float. Null unless the movement crossed currencies. */
  @Prop({ required: false, type: String, default: null })
  exchangeRate!: string | null;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: false, type: String, default: null })
  reference!: string | null;

  @Prop({ required: true, type: String, enum: Object.values(SpendCategory) })
  category!: SpendCategory;

  /** Once true, automatic categorisation never touches this row again. */
  @Prop({ required: true, type: Boolean, default: false })
  categoryOverridden!: boolean;

  @Prop({ required: false, type: CounterpartySchema, default: null })
  counterparty!: CounterpartySchemaClass | null;

  @Prop({ required: false, type: String, default: null })
  notes!: string | null;

  @Prop({ required: true, type: [String], default: () => [] })
  attachmentIds!: string[];

  @Prop({ required: false, type: String, default: null })
  disputeId!: string | null;

  @Prop({ required: true, type: Date, immutable: true })
  bookedAt!: Date;

  @Prop({ required: false, type: Date, default: null })
  completedAt!: Date | null;
}

export const TransactionSchema = SchemaFactory.createForClass(TransactionSchemaClass);

export type TransactionDocument = HydratedDocument<TransactionSchemaClass>;

/**
 * The idempotency index, and the reason the projector can be replayed safely.
 *
 * Unique rather than merely compound: a `E11000` from this index is the projector losing
 * a race, which it treats as "someone else already did it" and recovers from by reading
 * the winner's row. Without uniqueness that race silently doubles a customer's statement.
 */
TransactionSchema.index({ journalEntryId: 1, accountId: 1 }, { unique: true });

/** The account statement feed: newest first, with the ULID id as a total-order tie-break. */
TransactionSchema.index({ accountId: 1, bookedAt: -1, id: -1 });

/** The "everything across my accounts" feed, same ordering. */
TransactionSchema.index({ userId: 1, bookedAt: -1, id: -1 });

/** Reverse lookup from the system of record to its projection, used by reconciliation. */
TransactionSchema.index({ journalEntryId: 1 });

/**
 * Free-text search over the three fields a person actually remembers.
 *
 * Weighted so that a merchant name outranks a coincidental word in a narrative: searching
 * "Pret" should surface the coffee, not a transfer whose reference happens to contain it.
 */
TransactionSchema.index(
  { description: 'text', reference: 'text', 'counterparty.name': 'text' },
  {
    name: TRANSACTION_TEXT_INDEX,
    weights: { 'counterparty.name': 10, description: 5, reference: 1 },
  },
);
