import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { type TransactionRunner } from '../../../database/transaction.runner.js';
import { movementEntries, type JournalEntry } from '../../../domain/ledger/index.js';
import { InMemoryAccountBalancePort } from '../ports/in-memory-account-balance.port.js';
import { InMemoryJournalEntryStore } from '../repositories/in-memory-journal-entry.store.js';
import { InMemoryLedgerAccountStore } from '../repositories/in-memory-ledger-account.store.js';

/**
 * Shared fixtures for the ledger's unit tests.
 *
 * The in-memory stores are production code (other modules' tests use them too); what
 * lives here is only the wiring sugar — a runner that executes work inline and entry
 * factories with sensible defaults, so a test body states only what varies.
 */

/** A `TransactionRunner` that runs the callback inline, with a dummy session. */
export function passthroughRunner(): TransactionRunner {
  const session = {} as ClientSession;
  return {
    run: <T>(work: (s: ClientSession) => Promise<T>): Promise<T> => work(session),
    runIn: <T>(
      outer: ClientSession | undefined,
      work: (s: ClientSession) => Promise<T>,
    ): Promise<T> => work(outer ?? session),
  } as unknown as TransactionRunner;
}

export interface LedgerTestRig {
  entries: InMemoryJournalEntryStore;
  glAccounts: InMemoryLedgerAccountStore;
  balances: InMemoryAccountBalancePort;
}

/** Fresh in-memory stores with the real chart of accounts loaded. */
export function ledgerTestRig(): LedgerTestRig {
  return {
    entries: new InMemoryJournalEntryStore(),
    glAccounts: new InMemoryLedgerAccountStore().seedChart(),
    balances: new InMemoryAccountBalancePort(),
  };
}

export const TEST_VALUE_DATE = '2026-01-15';
export const TEST_BOOKED_AT = new Date('2026-01-15T10:30:00.000Z');

/** Money arriving from outside the bank: debit nostro, credit the customer. */
export function fundingEntry(input: {
  reference: string;
  accountId: string;
  amount: Money;
}): JournalEntry {
  return movementEntries.simulatedFunding({
    reference: input.reference,
    accountId: input.accountId,
    amount: input.amount,
    description: `Funding ${input.reference}`,
    valueDate: TEST_VALUE_DATE,
    bookedAt: TEST_BOOKED_AT,
  });
}

/** Customer-to-customer movement inside the bank. */
export function transferEntry(input: {
  reference: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
}): JournalEntry {
  return movementEntries.internalTransfer({
    reference: input.reference,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    description: `Transfer ${input.reference}`,
    valueDate: TEST_VALUE_DATE,
    bookedAt: TEST_BOOKED_AT,
  });
}

/** A valid-looking public account id for tests that do not care about the ULID part. */
export function testAccountId(label: string): string {
  return `acc_TEST${label.padEnd(22, '0')}`.slice(0, 30);
}
