/**
 * The mocks have to agree with themselves.
 *
 * Route coverage proves every endpoint answers. This file proves the answers are
 * *consistent*: a transfer moves the balance and shows up in the feed, a goal
 * contribution costs real money, a lost dispute takes the provisional credit back. Those
 * are the properties a UI lane will assume, and the properties a random-data mock breaks.
 */

import { ErrorCode, routes, TransactionDirection } from '@reliance/contracts';

import { db, resetMockDatabase } from '../db/database.js';
import { minorUnits, money } from '../db/money.js';
import { mockRoutes } from '../handlers/index.js';
import type { MockMethod, MockResult } from '../handlers/kit.js';
import { extractParams, matchPath } from '../handlers/match.js';

/** Drives a handler the way the MSW adapter does, without MSW. */
async function call(
  method: MockMethod,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Promise<MockResult> {
  const concrete = `/v1${path}`;
  const mockRoute = mockRoutes.find(
    (candidate) => candidate.method === method && matchPath(candidate.path, concrete),
  );
  if (!mockRoute) throw new Error(`No mock handler for ${method.toUpperCase()} ${path}`);

  return mockRoute.resolve({
    params: extractParams(mockRoute.path, concrete),
    query: new URLSearchParams(options.query ?? {}),
    headers: new Headers(options.headers ?? {}),
    body: options.body,
    db: db(),
  });
}

function dataOf<T>(result: MockResult): T {
  return (result.body as { data: T }).data;
}

function errorCodeOf(result: MockResult): string {
  return (result.body as { error: { code: string } }).error.code;
}

beforeEach(() => {
  resetMockDatabase();
});

describe('seeded determinism', () => {
  it('reproduces the same bank for the same seed', () => {
    const first = resetMockDatabase(4242);
    const firstSnapshot = {
      email: first.currentUser.email,
      accountIds: first.accounts.map((account) => account.id),
      balance: first.accounts[0]?.balance.ledger.amount,
    };

    const second = resetMockDatabase(4242);

    expect({
      email: second.currentUser.email,
      accountIds: second.accounts.map((account) => account.id),
      balance: second.accounts[0]?.balance.ledger.amount,
    }).toEqual(firstSnapshot);
  });

  it('produces a different bank for a different seed', () => {
    const a = resetMockDatabase(1);
    const idsA = a.accounts.map((account) => account.id);
    const b = resetMockDatabase(2);

    expect(b.accounts.map((account) => account.id)).not.toEqual(idsA);
  });

  it('discards mutations from a previous test', () => {
    db().accounts = [];
    expect(resetMockDatabase().accounts.length).toBeGreaterThan(0);
  });
});

describe('seed coherence', () => {
  it('gives the newest transaction a running balance equal to the account balance', () => {
    const account = db().accounts[0];
    const newest = db().transactions.find((transaction) => transaction.accountId === account?.id);

    expect(newest?.runningBalance.amount).toBe(account?.balance.ledger.amount);
  });

  it('keeps available equal to ledger minus holds plus overdraft', () => {
    for (const account of db().accounts) {
      const expected =
        minorUnits(account.balance.ledger) -
        minorUnits(account.balance.held) +
        minorUnits(account.balance.overdraftAvailable);

      expect(minorUnits(account.balance.available)).toBe(expected);
    }
  });

  it('books every transaction against an account that exists', () => {
    const accountIds = new Set(db().accounts.map((account) => account.id));
    for (const transaction of db().transactions) {
      expect(accountIds.has(transaction.accountId)).toBe(true);
    }
  });

  it('links the audit chain so verification is meaningful', async () => {
    const result = await call('post', routes.admin.verifyAuditChain);
    expect(dataOf<{ verified: boolean }>(result).verified).toBe(true);
  });

  it('detects a tampered audit event', async () => {
    const tampered = db().auditEvents[5];
    if (tampered) db().auditEvents[5] = { ...tampered, previousHash: 'forged' };

    const result = await call('post', routes.admin.verifyAuditChain);
    expect(dataOf<{ verified: boolean }>(result).verified).toBe(false);
  });
});

describe('a transfer moves real money', () => {
  it('debits the account, appends a transaction and raises a notification', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');

    const before = minorUnits(account.balance.ledger);
    const transactionsBefore = db().transactions.length;
    const notificationsBefore = db().notifications.length;

    const quote = await call('post', routes.transfers.quote, {
      body: {
        sourceAccountId: account.id,
        destination: {
          kind: 'DOMESTIC',
          accountName: 'Jane Smith',
          accountNumber: '1234567890',
          sortCode: '040004',
        },
        amount: money(25_000),
      },
    });
    const quoteId = dataOf<{ id: string }>(quote).id;

    const created = await call('post', routes.transfers.create, {
      body: { quoteId, reference: 'Rent' },
      headers: { 'idempotency-key': 'key-1' },
    });

    expect(created.status).toBe(201);

    const after = db().accounts.find((candidate) => candidate.id === account.id);
    expect(minorUnits(after?.balance.ledger ?? money(0))).toBe(before - 25_000n);
    expect(db().transactions).toHaveLength(transactionsBefore + 1);
    expect(db().notifications).toHaveLength(notificationsBefore + 1);
    expect(db().transactions[0]?.direction).toBe(TransactionDirection.DEBIT);
  });

  it('shows the new transfer at the top of the transfer list', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');

    const quote = await call('post', routes.transfers.quote, {
      body: {
        sourceAccountId: account.id,
        destination: {
          kind: 'DOMESTIC',
          accountName: 'Jane Smith',
          accountNumber: '1234567890',
          sortCode: '040004',
        },
        amount: money(1_000),
      },
    });

    const created = await call('post', routes.transfers.create, {
      body: { quoteId: dataOf<{ id: string }>(quote).id },
      headers: { 'idempotency-key': 'key-2' },
    });
    const transferId = dataOf<{ id: string }>(created).id;

    const list = await call('get', routes.transfers.list);
    const rows = (list.body as { data: { id: string }[] }).data;

    expect(rows[0]?.id).toBe(transferId);
  });

  it('refuses without an idempotency key', async () => {
    const result = await call('post', routes.transfers.create, { body: { quoteId: 'qte_x' } });
    expect(errorCodeOf(result)).toBe(ErrorCode.IDEMPOTENCY_KEY_REQUIRED);
  });

  it('refuses an unknown or expired quote', async () => {
    const result = await call('post', routes.transfers.create, {
      body: { quoteId: 'qte_nope' },
      headers: { 'idempotency-key': 'key-3' },
    });
    expect(errorCodeOf(result)).toBe(ErrorCode.QUOTE_NOT_FOUND);
  });

  it('refuses when the balance cannot cover it', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');

    const quote = await call('post', routes.transfers.quote, {
      body: {
        sourceAccountId: account.id,
        destination: {
          kind: 'DOMESTIC',
          accountName: 'Jane Smith',
          accountNumber: '1234567890',
          sortCode: '040004',
        },
        amount: money(9_999_999_999n),
      },
    });

    const result = await call('post', routes.transfers.create, {
      body: { quoteId: dataOf<{ id: string }>(quote).id },
      headers: { 'idempotency-key': 'key-4' },
    });

    expect(errorCodeOf(result)).toBe(ErrorCode.INSUFFICIENT_FUNDS);
  });
});

describe('a goal contribution costs real money', () => {
  it('moves the balance and advances the goal by the same amount', async () => {
    const goal = db().goals[0];
    if (!goal) throw new Error('seed produced no goals');

    const account = db().accounts.find((candidate) => candidate.id === goal.linkedAccountId);
    const balanceBefore = minorUnits(account?.balance.ledger ?? money(0));
    const goalBefore = minorUnits(goal.currentAmount);

    const result = await call('post', routes.save.contribute(goal.id), {
      body: { amount: money(5_000), accountId: goal.linkedAccountId },
    });

    const updated = dataOf<{ currentAmount: { amount: string } }>(result);
    const accountAfter = db().accounts.find((candidate) => candidate.id === goal.linkedAccountId);

    expect(BigInt(updated.currentAmount.amount)).toBe(goalBefore + 5_000n);
    expect(minorUnits(accountAfter?.balance.ledger ?? money(0))).toBe(balanceBefore - 5_000n);
  });

  it('refuses to withdraw more than the goal holds', async () => {
    const goal = db().goals[0];
    if (!goal) throw new Error('seed produced no goals');

    const result = await call('post', routes.save.withdraw(goal.id), {
      body: { amount: money(999_999_999n), accountId: goal.linkedAccountId },
    });

    expect(errorCodeOf(result)).toBe(ErrorCode.INSUFFICIENT_FUNDS);
  });
});

describe('cards', () => {
  it('refuses sensitive details without a step-up token', async () => {
    const card = db().cards[0];
    if (!card) throw new Error('seed produced no cards');

    const result = await call('post', routes.cards.sensitive(card.id));
    expect(errorCodeOf(result)).toBe(ErrorCode.STEP_UP_REQUIRED);
  });

  it('returns a PAN whose last four match the card', async () => {
    const card = db().cards[0];
    if (!card) throw new Error('seed produced no cards');

    const result = await call('post', routes.cards.sensitive(card.id), {
      headers: { 'x-step-up-token': 'grant-1' },
    });

    const pan = (result.body as { data: { pan: string } }).data.pan;
    expect(pan.replaceAll(' ', '').endsWith(card.last4)).toBe(true);
  });

  it('freezing a card changes its status and notifies the customer', async () => {
    const card = db().cards[0];
    if (!card) throw new Error('seed produced no cards');
    const notificationsBefore = db().notifications.length;

    await call('post', routes.cards.freeze(card.id));

    expect(db().cards[0]?.status).toBe('FROZEN');
    expect(db().notifications).toHaveLength(notificationsBefore + 1);
  });
});

describe('notifications', () => {
  it('marks everything read when no ids are supplied', async () => {
    await call('post', routes.notifications.markRead, { body: { ids: [] } });
    expect(db().notifications.every((notification) => notification.read)).toBe(true);
  });

  it('will not let the customer mute security notifications', async () => {
    const muted = db().notificationPreferences.preferences.map((preference) => ({
      ...preference,
      inApp: false,
      email: false,
      sms: false,
      push: false,
    }));

    const result = await call('put', routes.notifications.preferences, {
      body: { ...db().notificationPreferences, preferences: muted },
    });

    const security = dataOf<{ preferences: { category: string; email: boolean }[] }>(
      result,
    ).preferences.find((preference) => preference.category === 'SECURITY');

    expect(security?.email).toBe(true);
  });
});

describe('disputes', () => {
  it('refuses a second dispute on the same transaction', async () => {
    const existing = db().disputes[0];
    if (!existing) throw new Error('seed produced no disputes');

    const result = await call('post', routes.support.disputes, {
      body: { transactionId: existing.transactionId, reason: 'UNAUTHORISED', description: 'x' },
    });

    expect(errorCodeOf(result)).toBe(ErrorCode.DISPUTE_ALREADY_RAISED);
  });

  it('reverses the provisional credit when the bank loses', async () => {
    const dispute = db().disputes[0];
    if (!dispute) throw new Error('seed produced no disputes');
    expect(dispute.provisionalCredit).not.toBeNull();

    const result = await call('post', routes.admin.dispute(dispute.id), {
      body: { outcome: 'LOST', outcomeSummary: 'Merchant provided proof of delivery.' },
    });

    expect(dataOf<{ provisionalCredit: unknown }>(result).provisionalCredit).toBeNull();
  });
});

describe('the simulation clock', () => {
  it('advances the time the fixtures are dated against', async () => {
    const before = db().clock.nowIso();
    await call('post', routes.simulation.advance, { body: { days: 30 } });

    expect(db().clock.nowIso() > before).toBe(true);
  });

  it('refuses to advance by nothing', async () => {
    const result = await call('post', routes.simulation.advance, { body: { days: 0 } });
    expect(errorCodeOf(result)).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('minting credits the account and appends an inbound transaction', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');
    const before = minorUnits(account.balance.ledger);

    await call('post', routes.simulation.mint, {
      body: { toAccountId: account.id, amount: money(100_000), narrative: 'Salary' },
      headers: { 'idempotency-key': 'mint-1' },
    });

    const after = db().accounts.find((candidate) => candidate.id === account.id);
    expect(minorUnits(after?.balance.ledger ?? money(0))).toBe(before + 100_000n);
    expect(db().transactions[0]?.direction).toBe(TransactionDirection.CREDIT);
  });
});

describe('pagination', () => {
  it('walks a list with cursors without repeating or skipping', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 50; page += 1) {
      const query: Record<string, string> = { limit: '10' };
      if (cursor) query.cursor = cursor;

      const result = await call('get', routes.transactions.list, { query });
      const payload = result.body as {
        data: { id: string }[];
        page: { cursor: string | null; hasMore: boolean };
      };

      seen.push(...payload.data.map((row) => row.id));
      cursor = payload.page.cursor;
      if (!payload.page.hasMore) break;
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(db().transactions.length);
  });

  it('clamps the page size to the contract maximum', async () => {
    const result = await call('get', routes.transactions.list, { query: { limit: '5000' } });
    const payload = result.body as { page: { limit: number } };

    expect(payload.page.limit).toBe(100);
  });
});
