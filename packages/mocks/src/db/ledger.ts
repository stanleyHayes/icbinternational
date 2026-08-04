/**
 * Mutations that keep the mock bank internally consistent.
 *
 * These are the functions that make the difference between a mock and a fixture dump. A
 * transfer created through the mock API has to move the balance, add a row to the
 * transaction feed, and raise a notification — because a UI built against mocks where
 * those three disagree is a UI that has been taught the three can disagree.
 *
 * This is not double-entry. It is a *projection* that behaves the way the real ledger's
 * projection behaves; the real invariants live in `apps/api/src/domain/ledger`.
 */

import {
  EntryType,
  type NotificationCategory,
  NotificationSeverity,
  TransactionDirection,
  TransactionStatus,
  type Account,
  type Money,
  type Notification,
  type Transaction,
} from '@reliance/contracts';

import { makeBalance, makeJournalEntry } from '../factories/banking.js';
import { mockId } from '../faker.js';

import { minorUnits, money } from './money.js';
import type { MockDatabase } from './types.js';

/** What a posting needs to know. */
export interface PostingInput {
  readonly accountId: string;
  readonly amount: Money;
  readonly direction: TransactionDirection;
  readonly type: EntryType;
  readonly description: string;
  readonly reference?: string | null;
  readonly counterpartyName?: string | null;
}

/** Finds an account, or `undefined` when the id is unknown. */
export function findAccount(database: MockDatabase, accountId: string): Account | undefined {
  return database.accounts.find((account) => account.id === accountId);
}

/**
 * Applies a movement to an account and records it.
 *
 * Returns the new transaction so a handler can hand its id back to the caller. The
 * balance is recomputed rather than incremented in place, so `available` stays equal to
 * `ledger − held + overdraft` instead of drifting away from it over a session.
 */
export function postToAccount(
  database: MockDatabase,
  input: PostingInput,
): Transaction | undefined {
  const account = findAccount(database, input.accountId);
  if (!account) return undefined;

  const signed =
    input.direction === TransactionDirection.DEBIT
      ? -minorUnits(input.amount)
      : minorUnits(input.amount);
  const newLedgerMinor = minorUnits(account.balance.ledger) + signed;

  applyBalance(database, account, newLedgerMinor);

  const entry = makeJournalEntry({
    clock: database.clock,
    accountId: account.id,
    amountMinor: minorUnits(input.amount),
    currency: account.currency,
    type: input.type,
    description: input.description,
  });
  database.journalEntries.unshift(entry);

  const transaction: Transaction = {
    id: mockId('txn'),
    accountId: account.id,
    journalEntryId: entry.id,
    direction: input.direction,
    status: TransactionStatus.COMPLETED,
    type: input.type,
    amount: input.amount,
    runningBalance: money(newLedgerMinor, account.currency),
    originalAmount: null,
    exchangeRate: null,
    description: input.description,
    reference: input.reference ?? null,
    category: categoryFor(input.type, input.direction),
    categoryOverridden: false,
    counterparty: input.counterpartyName
      ? {
          name: input.counterpartyName,
          merchantId: null,
          mcc: null,
          logoUrl: null,
          accountNumberMasked: null,
          country: 'GB',
        }
      : null,
    notes: null,
    attachmentIds: [],
    disputeId: null,
    bookedAt: database.clock.nowIso(),
    completedAt: database.clock.nowIso(),
  };

  database.transactions.unshift(transaction);
  return transaction;
}

/** Replaces an account's balance, keeping the projection self-consistent. */
export function applyBalance(database: MockDatabase, account: Account, ledgerMinor: bigint): void {
  const index = database.accounts.findIndex((candidate) => candidate.id === account.id);
  if (index === -1) return;

  database.accounts[index] = {
    ...account,
    balance: makeBalance({
      clock: database.clock,
      ledgerMinor,
      heldMinor: minorUnits(account.balance.held),
      overdraftMinor: minorUnits(account.balance.overdraftAvailable),
      currency: account.currency,
    }),
  };
}

/** True when the account cannot cover the amount out of `available`. */
export function hasInsufficientFunds(account: Account, amount: Money): boolean {
  return minorUnits(account.balance.available) < minorUnits(amount);
}

/** Raises a notification, newest first. */
export function notify(
  database: MockDatabase,
  input: {
    category: NotificationCategory;
    title: string;
    body: string;
    severity?: NotificationSeverity;
    actionUrl?: string | null;
  },
): Notification {
  const notification: Notification = {
    id: mockId('ntf'),
    category: input.category,
    severity: input.severity ?? NotificationSeverity.INFO,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    actionLabel: null,
    iconKey: input.category.toLowerCase(),
    read: false,
    createdAt: database.clock.nowIso(),
    readAt: null,
  };

  database.notifications.unshift(notification);
  return notification;
}

/** Maps a ledger entry type onto the customer-facing spend category. */
function categoryFor(type: EntryType, direction: TransactionDirection) {
  if (direction === TransactionDirection.CREDIT) return 'INCOME' as const;
  if (type === EntryType.FEE) return 'FEES' as const;
  if (type === EntryType.CARD_PURCHASE) return 'SHOPPING' as const;
  if (type === EntryType.ATM_WITHDRAWAL) return 'CASH' as const;
  if (type === EntryType.GOAL_CONTRIBUTION) return 'SAVINGS' as const;
  return 'TRANSFERS' as const;
}
