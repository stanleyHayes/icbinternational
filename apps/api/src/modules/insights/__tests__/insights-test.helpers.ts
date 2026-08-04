import {
  EntryType,
  type SpendCategory,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { InMemoryTransactionStore } from '../../transactions/repositories/in-memory-transaction.store.js';
import {
  type NewTransaction,
  type TransactionRecord,
} from '../../transactions/repositories/transaction.store.js';
import { TransactionRangeReader } from '../../transactions/transaction-range.reader.js';

/** Fixtures shared by the insights suites. */

export const CURRENCY: CurrencyCode = 'GBP';
export const USER_ID = 'usr_01JQ8Z00000000000000000001';
export const ACCOUNT_ID = 'acc_01JQ8Z00000000000000000001';

export function gbp(minorUnits: number | string): Money {
  return Money.fromMinor(minorUnits, CURRENCY);
}

let sequence = 0;

/** A spend row. Amounts are magnitudes; `direction` carries the sign, as in storage. */
export function spendRow(input: {
  minorUnits: number;
  category: SpendCategory;
  bookedAt: Date;
  runningBalanceMinor?: number;
  direction?: TransactionDirection;
  merchant?: string;
  merchantId?: string;
  status?: TransactionStatus;
}): NewTransaction {
  sequence += 1;

  return {
    accountId: ACCOUNT_ID,
    journalEntryId: `jnl_${String(sequence).padStart(26, '0')}`,
    userId: USER_ID,
    direction: input.direction ?? TransactionDirection.DEBIT,
    status: input.status ?? TransactionStatus.COMPLETED,
    type: EntryType.CARD_PURCHASE,
    amount: toStored(gbp(input.minorUnits)),
    runningBalance: toStored(gbp(input.runningBalanceMinor ?? 0)),
    originalAmount: null,
    exchangeRate: null,
    description: input.merchant ?? 'Card purchase',
    reference: null,
    category: input.category,
    counterparty: input.merchant
      ? {
          name: input.merchant,
          merchantId: input.merchantId ?? null,
          mcc: null,
          logoUrl: null,
          accountNumberMasked: null,
          country: 'GB',
        }
      : null,
    bookedAt: input.bookedAt,
    completedAt: input.bookedAt,
  };
}

export interface InsightsHarness {
  store: InMemoryTransactionStore;
  reader: TransactionRangeReader;
}

export function buildHarness(): InsightsHarness {
  const store = new InMemoryTransactionStore();
  return { store, reader: new TransactionRangeReader(store) };
}

/** Inserts every row and returns what was written. */
export async function insertAll(
  store: InMemoryTransactionStore,
  rows: readonly NewTransaction[],
): Promise<TransactionRecord[]> {
  const written: TransactionRecord[] = [];
  for (const one of rows) written.push(await store.insert(one));
  return written;
}
