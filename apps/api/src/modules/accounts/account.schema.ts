import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { AccountStatus, AccountType } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { ACCOUNT_COLLECTION } from './account.constants.js';

/**
 * A customer account.
 *
 * Three balance fields are stored and all three are projections of the ledger:
 *
 * - `ledgerBalance` — the sum of every posting, moved only by `PostingService` through
 *   `AccountBalancePort`.
 * - `holdTotal` — the sum of every `ACTIVE` hold, moved only by the holds module.
 * - `availableBalance` — maintained as exactly `ledgerBalance − holdTotal`.
 *
 * The third is redundant by that identity and is stored anyway so a query can filter and
 * sort on spendable money without recomputing it per document. The identity is an
 * invariant, asserted in tests, and `LedgerVerifierService` re-derives `ledgerBalance`
 * from the journal independently. Note that `availableBalance` excludes the overdraft
 * facility: what a customer may actually spend adds `overdraftLimit` on top, and that
 * sum belongs to `availability.ts`, not to a stored field that could go stale when a
 * facility is re-sized.
 *
 * `version` is hand-maintained rather than relying on Mongoose's `__v`, because `__v`
 * only guards `document.save()` and every write in this module goes through
 * `findOneAndUpdate` so that concurrent updates to unrelated fields cannot lose each
 * other to a stale in-memory copy.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: ACCOUNT_COLLECTION, id: false })
export class AccountSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  /** The primary holder. Ownership checks resolve against this, never `holderIds`. */
  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  /** Every holder, primary first. A joint account has more than one. */
  @Prop({ type: [String], required: true, default: undefined })
  holderIds!: string[];

  @Prop({ type: String, required: true, enum: Object.values(AccountType), immutable: true })
  type!: AccountType;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(AccountStatus),
    default: AccountStatus.PENDING,
    index: true,
  })
  status!: AccountStatus;

  /** ISO 4217. Immutable: an account holds exactly one currency for its whole life. */
  @Prop({ type: String, required: true, immutable: true })
  currency!: string;

  /**
   * The product version this account was sold under.
   *
   * Both halves are pinned at opening and never move. Repricing publishes a new version;
   * this account keeps the terms it was opened on, which is what lets a statement issued
   * years later still explain a fee correctly.
   */
  @Prop({ type: String, required: true, immutable: true })
  productCode!: string;

  @Prop({ type: Number, required: true, immutable: true })
  productVersion!: number;

  /** Denormalised from the pinned product version so a list read is a single query. */
  @Prop({ type: String, required: true })
  productName!: string;

  /** Customer-set label. Null means "show the product name". */
  @Prop({ type: String, default: null })
  nickname!: string | null;

  @Prop({ type: String, required: true, unique: true, immutable: true })
  number!: string;

  @Prop({ type: String, required: true, immutable: true })
  sortCode!: string;

  @Prop({ type: String, required: true, unique: true, immutable: true })
  iban!: string;

  @Prop(moneyProp)
  ledgerBalance!: StoredMoney;

  @Prop(moneyProp)
  availableBalance!: StoredMoney;

  @Prop(moneyProp)
  holdTotal!: StoredMoney;

  /** Arranged overdraft facility. Zero when the customer has none. */
  @Prop(moneyProp)
  overdraftLimit!: StoredMoney;

  /**
   * The deposit that activates the account, copied from the product version at opening.
   *
   * Stored rather than looked up because activation happens inside the posting
   * transaction, where a second read of the product catalogue would be a needless
   * dependency on another collection at the hottest moment in the system.
   */
  @Prop(moneyProp)
  minimumOpeningBalance!: StoredMoney;

  /** Credit interest in basis points, pinned at opening. Null when the product pays none. */
  @Prop({ type: Number, default: null })
  interestRateBps!: number | null;

  /** At most one account per customer per currency carries this. */
  @Prop({ type: Boolean, default: false })
  isPrimary!: boolean;

  @Prop({ type: Date, required: true })
  openedAt!: Date;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  /** When the account was marked dormant. Cleared the moment a posting wakes it. */
  @Prop({ type: Date, default: null })
  dormantAt!: Date | null;

  /** Last customer-initiated movement, the input to the dormancy sweep. */
  @Prop({ type: Date, required: true })
  lastActivityAt!: Date;

  /** Optimistic-concurrency counter. Every balance write is conditional on it. */
  @Prop({ type: Number, required: true, default: 0 })
  version!: number;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type AccountDocument = HydratedDocument<AccountSchemaClass>;

export const AccountSchema = SchemaFactory.createForClass(AccountSchemaClass);

/** The customer's own list: their accounts, newest first, optionally filtered by status. */
AccountSchema.index({ userId: 1, status: 1, openedAt: -1 });

/** Joint accounts are found by holder, not by owner. */
AccountSchema.index({ holderIds: 1 });

/**
 * The dormancy sweep reads open accounts that have been quiet the longest.
 *
 * Partial, because closed accounts can never become dormant and there will eventually be
 * far more of them than live ones.
 */
AccountSchema.index(
  { lastActivityAt: 1 },
  { partialFilterExpression: { status: AccountStatus.ACTIVE } },
);
