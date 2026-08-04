/**
 * Fixtures for the statements suites.
 *
 * The whole module is a read over the transaction projection, so the in-memory store is
 * not a shortcut here — it is the real collaborator with the same ordering and scoping
 * rules, and a suite that passes against it is testing behaviour rather than leniency.
 */

import {
  AccountStatus,
  AccountType,
  EntryType,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { type AccountRecord } from '../../accounts/index.js';
import { InMemoryTransactionStore } from '../../transactions/repositories/in-memory-transaction.store.js';
import { type NewTransaction } from '../../transactions/repositories/transaction.store.js';
import { TransactionRangeReader } from '../../transactions/transaction-range.reader.js';
import { StatementBuilderService } from '../statement-builder.service.js';

export const CURRENCY: CurrencyCode = 'GBP';
export const USER_ID = 'usr_01JQ8Z00000000000000000001';
export const ACCOUNT_ID = 'acc_01JQ8Z00000000000000000001';
export const OTHER_ACCOUNT_ID = 'acc_01JQ8Z00000000000000000002';

export function gbp(minorUnits: number | string): Money {
  return Money.fromMinor(minorUnits, CURRENCY);
}

export function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    holderIds: [USER_ID],
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency: CURRENCY,
    productCode: 'EVERYDAY',
    productVersion: 1,
    productName: 'Everyday Current Account',
    nickname: null,
    number: '20461377',
    sortCode: '04-00-04',
    iban: 'GB29RELI04000420461377',
    ledgerBalance: toStored(gbp(0)),
    availableBalance: toStored(gbp(0)),
    holdTotal: toStored(gbp(0)),
    overdraftLimit: toStored(gbp(0)),
    minimumOpeningBalance: toStored(gbp(0)),
    interestRateBps: null,
    isPrimary: true,
    openedAt: new Date('2025-11-14T09:00:00.000Z'),
    closedAt: null,
    dormantAt: null,
    lastActivityAt: new Date('2026-03-01T09:00:00.000Z'),
    version: 1,
    ...overrides,
  };
}

let sequence = 0;

/** A posting as the projector writes it: a magnitude, a direction, and a balance after. */
export function row(input: {
  minorUnits: number;
  runningBalanceMinor: number;
  bookedAt: string;
  direction?: TransactionDirection;
  type?: EntryType;
  accountId?: string;
}): NewTransaction {
  sequence += 1;

  return {
    accountId: input.accountId ?? ACCOUNT_ID,
    journalEntryId: `jnl_${String(sequence).padStart(26, '0')}`,
    userId: USER_ID,
    direction: input.direction ?? TransactionDirection.DEBIT,
    status: TransactionStatus.COMPLETED,
    type: input.type ?? EntryType.CARD_PURCHASE,
    amount: toStored(gbp(input.minorUnits)),
    runningBalance: toStored(gbp(input.runningBalanceMinor)),
    originalAmount: null,
    exchangeRate: null,
    description: 'Card purchase',
    reference: null,
    category: 'SHOPPING',
    counterparty: null,
    bookedAt: new Date(input.bookedAt),
    completedAt: new Date(input.bookedAt),
  };
}

export interface StatementsHarness {
  readonly store: InMemoryTransactionStore;
  readonly builder: StatementBuilderService;
}

export function buildHarness(): StatementsHarness {
  const store = new InMemoryTransactionStore();
  return { store, builder: new StatementBuilderService(store, new TransactionRangeReader(store)) };
}
