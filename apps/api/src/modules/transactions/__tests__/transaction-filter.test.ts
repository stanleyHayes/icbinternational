import { SpendCategory, TransactionDirection, TransactionStatus } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { encodeCursor } from '../../../common/pagination/cursor.js';
import { buildListFilter, buildRangeFilter } from '../repositories/transaction-filter.js';

import { ACCOUNT_ID, USER_ID } from './transaction-test.helpers.js';

/**
 * The Mongo query builder, tested as the pure function it is.
 *
 * These clauses are the part of the module that cannot be exercised without a replica
 * set, and the part where a mistake is worst: a missing `userId` here is a data breach
 * rather than a bug. Asserting on the query shape catches that without a database.
 */

/** The `$and` clauses, which is how the builder always composes a filter. */
function clauses(filter: object): Record<string, unknown>[] {
  const and = (filter as { $and?: Record<string, unknown>[] }).$and;
  return and ?? [];
}

const BASE = { userId: USER_ID, limit: 25 };

describe('buildListFilter', () => {
  it('always scopes to the owner, even with no other filter', () => {
    expect(clauses(buildListFilter(BASE))).toContainEqual({ userId: USER_ID });
  });

  it('emits a clause only for the filters that were supplied', () => {
    const filter = buildListFilter({
      ...BASE,
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.DEBIT,
    });

    const keys = clauses(filter).flatMap((clause) => Object.keys(clause));
    expect(keys).toEqual(['userId', 'accountId', 'direction']);
    // An explicit `undefined` would reach Mongo as "field is absent", not "no filter".
    expect(keys).not.toContain('status');
  });

  it('carries every equality filter through', () => {
    const filter = buildListFilter({
      ...BASE,
      status: TransactionStatus.PENDING,
      category: SpendCategory.DINING,
    });

    expect(clauses(filter)).toContainEqual({ status: TransactionStatus.PENDING });
    expect(clauses(filter)).toContainEqual({ category: SpendCategory.DINING });
  });

  it('compares amounts as Decimal128, not as strings', () => {
    const filter = buildListFilter({ ...BASE, minAmount: '10', maxAmount: '5000' });

    expect(clauses(filter)).toContainEqual({
      $expr: { $gte: [{ $toDecimal: '$amount.amount' }, { $toDecimal: '10' }] },
    });
    expect(clauses(filter)).toContainEqual({
      $expr: { $lte: [{ $toDecimal: '$amount.amount' }, { $toDecimal: '5000' }] },
    });
  });

  it('bounds the date range on both sides when both are given', () => {
    const from = new Date('2026-03-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.000Z');

    expect(clauses(buildListFilter({ ...BASE, from, to }))).toContainEqual({
      bookedAt: { $gte: from, $lte: to },
    });
  });

  it('uses the text index for a search term', () => {
    expect(clauses(buildListFilter({ ...BASE, search: 'pret' }))).toContainEqual({
      $text: { $search: 'pret' },
    });
  });

  it('expresses the cursor as a total order over (bookedAt, id)', () => {
    const anchor = { sortValue: '2026-03-10T10:00:00.000Z', id: 'txn_anchor' };
    const filter = buildListFilter({ ...BASE, cursor: encodeCursor(anchor) });

    const bookedAt = new Date(anchor.sortValue);
    expect(clauses(filter)).toContainEqual({
      $or: [{ bookedAt: { $lt: bookedAt } }, { bookedAt, id: { $lt: anchor.id } }],
    });
  });

  it('rejects a cursor this API did not issue rather than silently serving page one', () => {
    expect(() => buildListFilter({ ...BASE, cursor: 'not-a-cursor' })).toThrow(AppError);
    expect(() =>
      buildListFilter({ ...BASE, cursor: encodeCursor({ sortValue: 'nonsense', id: 'x' }) }),
    ).toThrow(AppError);
  });
});

describe('buildRangeFilter', () => {
  const RANGE = {
    userId: USER_ID,
    from: new Date('2026-03-01T00:00:00.000Z'),
    to: new Date('2026-03-31T00:00:00.000Z'),
    limit: 100,
  };

  it('scopes to the owner and the window', () => {
    const found = clauses(buildRangeFilter(RANGE));

    expect(found).toContainEqual({ userId: USER_ID });
    expect(found).toContainEqual({ bookedAt: { $gte: RANGE.from, $lte: RANGE.to } });
  });

  it('keysets on the id so a row inserted mid-scan cannot shift the window', () => {
    expect(clauses(buildRangeFilter({ ...RANGE, afterId: 'txn_last' }))).toContainEqual({
      id: { $gt: 'txn_last' },
    });
  });

  it('narrows to one account when asked', () => {
    expect(clauses(buildRangeFilter({ ...RANGE, accountId: ACCOUNT_ID }))).toContainEqual({
      accountId: ACCOUNT_ID,
    });
  });
});
