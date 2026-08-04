import {
  EntryType,
  JournalEntryStatus,
  PostingDirection,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { InMemoryAccountBalancePort } from '../../ledger/ports/in-memory-account-balance.port.js';
import {
  type JournalEntryRecord,
  type PostingRecord,
} from '../../ledger/repositories/journal-entry.store.js';
import { CategorisationService } from '../categorisation.service.js';
import { InMemoryAccountOwnerPort } from '../ports/in-memory-account-owner.port.js';
import { InMemoryTransactionStore } from '../repositories/in-memory-transaction.store.js';
import { type NewTransaction, type TransactionRecord } from '../repositories/transaction.store.js';
import { TransactionProjectorService } from '../transaction-projector.service.js';

/** Fixtures shared by the transaction suites. Kept honest — no shortcuts the real code lacks. */

export const CURRENCY = 'GBP';
export const USER_ID = 'usr_01JQ8Z00000000000000000001';
export const ACCOUNT_ID = 'acc_01JQ8Z00000000000000000001';
export const GL_CUSTOMER_DEPOSITS = '2000';
export const GL_CARD_SETTLEMENT = '1200';

export function gbp(minorUnits: number | string): Money {
  return Money.fromMinor(minorUnits, CURRENCY);
}

/** A customer leg plus its balancing GL leg — the minimum a real entry ever has. */
export function postings(input: {
  accountId: string;
  amount: Money;
  direction: PostingDirection;
}): PostingRecord[] {
  const opposite =
    input.direction === PostingDirection.DEBIT ? PostingDirection.CREDIT : PostingDirection.DEBIT;

  return [
    {
      ledgerAccountCode: GL_CUSTOMER_DEPOSITS,
      ledgerAccountName: 'Customer Deposits',
      accountId: input.accountId,
      direction: input.direction,
      amount: toStored(input.amount),
      narrative: 'Customer leg',
    },
    {
      ledgerAccountCode: GL_CARD_SETTLEMENT,
      ledgerAccountName: 'Card Settlement',
      accountId: null,
      direction: opposite,
      amount: toStored(input.amount),
      narrative: 'Settlement leg',
    },
  ];
}

export function entry(overrides: Partial<JournalEntryRecord> = {}): JournalEntryRecord {
  const bookedAt = overrides.bookedAt ?? new Date('2026-03-01T10:00:00.000Z');

  return {
    id: 'jnl_01JQ8Z00000000000000000001',
    reference: 'REF-1',
    type: EntryType.CARD_PURCHASE,
    status: JournalEntryStatus.POSTED,
    description: 'Card purchase',
    valueDate: bookedAt.toISOString().slice(0, 10),
    bookedAt,
    postings: postings({
      accountId: ACCOUNT_ID,
      amount: gbp(1250),
      direction: PostingDirection.DEBIT,
    }),
    reversesEntryId: null,
    reversedByEntryId: null,
    metadata: {},
    ...overrides,
  };
}

export interface ProjectorHarness {
  projector: TransactionProjectorService;
  store: InMemoryTransactionStore;
  balances: InMemoryAccountBalancePort;
  owners: InMemoryAccountOwnerPort;
}

/** Wires the projector against honest in-memory adapters, with one open account. */
export function buildProjector(opening: Money = gbp(100_000)): ProjectorHarness {
  const store = new InMemoryTransactionStore(new IdGenerator());
  const balances = new InMemoryAccountBalancePort();
  const owners = new InMemoryAccountOwnerPort();

  balances.open({ accountId: ACCOUNT_ID, opening });
  owners.register(ACCOUNT_ID, USER_ID);

  return {
    projector: new TransactionProjectorService(
      store,
      balances,
      owners,
      new CategorisationService(),
    ),
    store,
    balances,
    owners,
  };
}

/** A ready-made row, for the suites that test reads rather than projection. */
export function row(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    accountId: ACCOUNT_ID,
    journalEntryId: 'jnl_01JQ8Z00000000000000000001',
    userId: USER_ID,
    direction: TransactionDirection.DEBIT,
    status: TransactionStatus.COMPLETED,
    type: EntryType.CARD_PURCHASE,
    amount: toStored(gbp(1250)),
    runningBalance: toStored(gbp(98_750)),
    originalAmount: null,
    exchangeRate: null,
    description: 'Card purchase',
    reference: 'REF-1',
    category: SpendCategory.SHOPPING,
    counterparty: null,
    bookedAt: new Date('2026-03-01T10:00:00.000Z'),
    completedAt: new Date('2026-03-01T10:00:00.000Z'),
    ...overrides,
  };
}

/** Inserts `count` rows one day apart, oldest first, and returns them. */
export async function seedRows(
  store: InMemoryTransactionStore,
  count: number,
  overrides: Partial<NewTransaction> = {},
): Promise<TransactionRecord[]> {
  const inserted: TransactionRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    inserted.push(
      await store.insert(
        row({
          journalEntryId: `jnl_${String(index).padStart(26, '0')}`,
          bookedAt: new Date(Date.UTC(2026, 2, index + 1, 10)),
          ...overrides,
        }),
      ),
    );
  }

  return inserted;
}
