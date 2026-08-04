import { SpendCategory, TransactionDirection, TransactionStatus } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { InMemoryTransactionStore } from '../repositories/in-memory-transaction.store.js';
import { TransactionService } from '../transaction.service.js';

import { row, seedRows, USER_ID } from './transaction-test.helpers.js';

const OTHER_USER = 'usr_01JQ8Z00000000000000000009';
const PAGE_SIZE = 3;

function build(): { store: InMemoryTransactionStore; service: TransactionService } {
  const store = new InMemoryTransactionStore();
  return { store, service: new TransactionService(store) };
}

function query(overrides: Record<string, unknown> = {}) {
  return { limit: PAGE_SIZE, ...overrides } as Parameters<TransactionService['list']>[1];
}

describe('TransactionService', () => {
  describe('cursor pagination', () => {
    it('is stable when rows are inserted between pages', async () => {
      const { store, service } = build();
      await seedRows(store, 6);

      const first = await service.list(USER_ID, query());
      expect(first.data).toHaveLength(PAGE_SIZE);
      expect(first.page.hasMore).toBe(true);

      // A newer transaction lands while the customer is reading page one. With an offset
      // this would push a row from page one onto page two and it would be seen twice.
      await store.insert(
        row({ journalEntryId: 'jnl_late', bookedAt: new Date('2026-04-01T10:00:00.000Z') }),
      );

      const second = await service.list(USER_ID, query({ cursor: first.page.cursor ?? undefined }));

      const seen = [...first.data, ...second.data].map((transaction) => transaction.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('walks the whole feed without skipping or repeating a row', async () => {
      const { store, service } = build();
      const inserted = await seedRows(store, 7);

      const collected: string[] = [];
      let cursor: string | undefined;

      do {
        const page = await service.list(USER_ID, query({ cursor }));
        collected.push(...page.data.map((transaction) => transaction.id));
        cursor = page.page.cursor ?? undefined;
      } while (cursor);

      expect(collected).toHaveLength(inserted.length);
      expect(new Set(collected).size).toBe(inserted.length);
    });

    it('orders newest first', async () => {
      const { store, service } = build();
      await seedRows(store, 4);

      const page = await service.list(USER_ID, query({ limit: 4 }));
      const booked = page.data.map((transaction) => transaction.bookedAt);

      expect([...booked].sort().reverse()).toEqual(booked);
    });
  });

  describe('filters', () => {
    it('narrows by amount using exact integer comparison, not string order', async () => {
      const { store, service } = build();
      await store.insert(
        row({ journalEntryId: 'jnl_a', amount: { amount: '9', currency: 'GBP' } }),
      );
      await store.insert(
        row({ journalEntryId: 'jnl_b', amount: { amount: '10', currency: 'GBP' } }),
      );

      // Lexicographically "9" sorts above "10"; numerically it does not.
      const page = await service.list(USER_ID, query({ minAmount: '10' }));

      expect(page.data.map((transaction) => transaction.amount.amount)).toEqual(['10']);
    });

    it('narrows by category and direction', async () => {
      const { store, service } = build();
      await store.insert(row({ journalEntryId: 'jnl_a', category: SpendCategory.DINING }));
      await store.insert(
        row({
          journalEntryId: 'jnl_b',
          category: SpendCategory.INCOME,
          direction: TransactionDirection.CREDIT,
        }),
      );

      const dining = await service.list(USER_ID, query({ category: SpendCategory.DINING }));
      const credits = await service.list(
        USER_ID,
        query({ direction: TransactionDirection.CREDIT }),
      );

      expect(dining.data).toHaveLength(1);
      expect(credits.data).toHaveLength(1);
      expect(credits.data[0]?.category).toBe(SpendCategory.INCOME);
    });

    it('never returns another customer rows', async () => {
      const { store, service } = build();
      await store.insert(row({ journalEntryId: 'jnl_mine' }));
      await store.insert(row({ journalEntryId: 'jnl_theirs', userId: OTHER_USER }));

      const mine = await service.list(USER_ID, query());
      expect(mine.data).toHaveLength(1);
    });
  });

  describe('ownership', () => {
    it('answers 404 for a row belonging to someone else', async () => {
      const { store, service } = build();
      const theirs = await store.insert(row({ userId: OTHER_USER }));

      await expect(
        service.get({ userId: USER_ID, transactionId: theirs.id }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('answers 404 for an unknown id', async () => {
      const { service } = build();

      await expect(
        service.get({ userId: USER_ID, transactionId: 'txn_missing' }),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('customer edits', () => {
    it('marks a category change as overridden', async () => {
      const { store, service } = build();
      const inserted = await store.insert(row());

      const updated = await service.update(
        { userId: USER_ID, transactionId: inserted.id },
        { category: SpendCategory.HEALTH },
      );

      expect(updated.category).toBe(SpendCategory.HEALTH);
      expect(updated.categoryOverridden).toBe(true);
    });

    it('clears a note when null is sent, and leaves it alone when the key is absent', async () => {
      const { store, service } = build();
      const inserted = await store.insert(row());
      const reference = { userId: USER_ID, transactionId: inserted.id };

      await service.update(reference, { notes: 'Team lunch' });
      const untouched = await service.update(reference, { category: SpendCategory.DINING });
      expect(untouched.notes).toBe('Team lunch');

      const cleared = await service.update(reference, { notes: null });
      expect(cleared.notes).toBeNull();
    });

    it('refuses an edit to another customer row', async () => {
      const { store, service } = build();
      const theirs = await store.insert(row({ userId: OTHER_USER }));

      await expect(
        service.update({ userId: USER_ID, transactionId: theirs.id }, { notes: 'mine now' }),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  it('presents the contract shape, with ISO timestamps and no internal fields', async () => {
    const { store, service } = build();
    const inserted = await store.insert(row());

    const presented = await service.get({ userId: USER_ID, transactionId: inserted.id });

    expect(presented.bookedAt).toBe('2026-03-01T10:00:00.000Z');
    expect(presented.status).toBe(TransactionStatus.COMPLETED);
    expect(presented).not.toHaveProperty('userId');
  });
});
