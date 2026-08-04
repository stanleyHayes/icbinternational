import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { fromStoredOrZero, toStored, type StoredMoney } from '../../../common/money/money.codec.js';
import { LEDGER_ACCOUNT_MODEL } from '../ledger.constants.js';
import {
  LedgerAccountSchemaClass,
  type LedgerAccountDocument,
} from '../schemas/ledger-account.schema.js';

import {
  LedgerAccountStore,
  type EnsureOutcome,
  type LedgerAccountRecord,
  type LedgerEffectInput,
  type NewLedgerAccount,
  type TrialBalanceQuery,
  type TrialBalanceRow,
} from './ledger-account.store.js';

/**
 * MongoDB-backed chart-of-accounts persistence.
 *
 * `balances` is a read-modify-write projection — MongoDB cannot `$inc` a string-encoded
 * bigint — which is why {@link applyEffect} demands a session: inside the posting
 * transaction a lost update aborts with a write conflict and the whole callback retries;
 * outside one it would silently vanish.
 */
@Injectable()
export class LedgerAccountRepository extends LedgerAccountStore {
  constructor(
    @InjectModel(LEDGER_ACCOUNT_MODEL)
    private readonly model: Model<LedgerAccountSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async findByCode(
    code: string,
    session?: ClientSession,
  ): Promise<LedgerAccountRecord | null> {
    const document = await this.model
      .findOne({ code })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as LedgerAccountDocument) : null;
  }

  override async listAll(session?: ClientSession): Promise<LedgerAccountRecord[]> {
    const documents = await this.model
      .find({})
      .sort({ code: 1 })
      .session(session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as LedgerAccountDocument));
  }

  /**
   * Idempotent seed write: create if absent, refresh descriptive fields if changed.
   *
   * Never touches `balances` — re-seeding the chart against a live bank is a routine
   * deployment step and must not be capable of zeroing the books.
   */
  override async ensure(input: NewLedgerAccount, session?: ClientSession): Promise<EnsureOutcome> {
    const existing = await this.findByCode(input.code, session);

    if (!existing) {
      const [created] = await this.model.create(
        [{ ...input, id: this.ids.generate('ledgerAccount'), balances: {} }],
        { session: session ?? undefined },
      );
      return { record: toRecord(created as LedgerAccountDocument), result: 'created' };
    }

    if (existing.name === input.name && existing.isControlAccount === input.isControlAccount) {
      return { record: existing, result: 'unchanged' };
    }

    const updated = await this.model
      .findOneAndUpdate(
        { code: input.code },
        { $set: { name: input.name, isControlAccount: input.isControlAccount } },
        { new: true, session: session ?? null },
      )
      .exec();
    return { record: toRecord(updated as LedgerAccountDocument), result: 'updated' };
  }

  /**
   * Adds `delta` to the account's balance in its currency, inside the caller's transaction.
   *
   * Two round trips on purpose. A pipeline update could compute the sum server-side, but
   * the arithmetic belongs to `Money` — the one place money math is legal — not to an
   * aggregation expression nobody can unit-test.
   */
  override async applyEffect(input: LedgerEffectInput): Promise<void> {
    const account = await this.findByCode(input.code, input.session);
    if (!account) {
      // The chart is seeded before the first posting; reaching this means it was not.
      throw new RangeError(
        `GL account ${input.code} does not exist. Seed the chart of accounts before posting.`,
      );
    }

    const currency = input.delta.currency;
    const current = fromStoredOrZero(account.balances[currency], currency);
    const next = current.plus(input.delta);

    await this.model
      .updateOne(
        { code: input.code },
        { $set: { [`balances.${currency}`]: toStored(next) } },
        { session: input.session },
      )
      .exec();
  }

  override async trialBalance(query: TrialBalanceQuery): Promise<TrialBalanceRow[]> {
    const accounts = await this.listAll(query.session);

    return accounts
      .filter((account) => account.balances[query.currency] !== undefined)
      .map((account) => ({
        code: account.code,
        name: account.name,
        type: account.type,
        balance: account.balances[query.currency] as StoredMoney,
      }));
  }
}

/** Hydrated document to plain record, copying the balance map out of its Mongoose wrapper. */
export function toRecord(document: LedgerAccountDocument): LedgerAccountRecord {
  const plain = document.toObject<LedgerAccountSchemaClass>();
  return {
    id: plain.id,
    code: plain.code,
    name: plain.name,
    type: plain.type,
    isControlAccount: plain.isControlAccount,
    balances: copyBalances(plain.balances),
  };
}

function copyBalances(
  balances: Map<string, StoredMoney> | Record<string, StoredMoney>,
): Record<string, StoredMoney> {
  const entries = balances instanceof Map ? [...balances.entries()] : Object.entries(balances);
  return Object.fromEntries(
    entries.map(([currency, stored]) => [
      currency,
      { amount: stored.amount, currency: stored.currency },
    ]),
  );
}
