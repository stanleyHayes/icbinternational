import { type QueryFilter } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { decodeCursor } from '../../../common/pagination/cursor.js';
import { type TransactionSchemaClass } from '../schemas/transaction.schema.js';

import { type TransactionListQuery, type TransactionRangeQuery } from './transaction.store.js';

type Filter = QueryFilter<TransactionSchemaClass>;

/**
 * Translates the contract's filter set into a Mongo query.
 *
 * Kept out of the repository because it is the fiddliest part of the module and the part
 * most likely to be got wrong in a way no type checker notices — a forgotten `userId`
 * here is a data breach, not a bug.
 */
export function buildListFilter(query: TransactionListQuery): Filter {
  const conditions: Filter[] = [
    { userId: query.userId },
    ...equalityConditions(query),
    ...amountConditions(query),
    ...bookedAtConditions(query.from, query.to),
    ...searchCondition(query.search),
    ...cursorCondition(query.cursor),
  ];

  return { $and: conditions } as Filter;
}

/** Oldest-first keyset window, used by insights and exports. */
export function buildRangeFilter(query: TransactionRangeQuery): Filter {
  const conditions: Filter[] = [
    { userId: query.userId },
    ...(query.accountId ? [{ accountId: query.accountId }] : []),
    ...bookedAtConditions(query.from, query.to),
    ...(query.afterId ? [{ id: { $gt: query.afterId } }] : []),
  ];

  return { $and: conditions } as Filter;
}

function equalityConditions(query: TransactionListQuery): Filter[] {
  const pairs: [keyof TransactionListQuery, string][] = [
    ['accountId', 'accountId'],
    ['direction', 'direction'],
    ['status', 'status'],
    ['category', 'category'],
    ['type', 'type'],
  ];

  return pairs
    .filter(([source]) => query[source] !== undefined)
    .map(([source, field]) => ({ [field]: query[source] }) as Filter);
}

/**
 * Numeric comparison over an amount that is stored as a string.
 *
 * Minor units are persisted as a decimal string because a large balance does not survive
 * an IEEE-754 double, but that makes `$gte` lexicographic — `"9"` would sort above
 * `"10"`. `$toDecimal` converts both sides to Decimal128 server-side, which is exact to
 * 34 digits and never involves a JavaScript number. It cannot use the index, which is
 * why it only ever runs inside a set already narrowed by `userId` or `accountId`.
 */
function amountConditions(query: TransactionListQuery): Filter[] {
  const bounds: [string | undefined, '$gte' | '$lte'][] = [
    [query.minAmount, '$gte'],
    [query.maxAmount, '$lte'],
  ];

  return bounds
    .filter((bound): bound is [string, '$gte' | '$lte'] => bound[0] !== undefined)
    .map(
      ([value, operator]) =>
        ({
          $expr: { [operator]: [{ $toDecimal: '$amount.amount' }, { $toDecimal: value }] },
        }) as Filter,
    );
}

function bookedAtConditions(from?: Date, to?: Date): Filter[] {
  if (!from && !to) return [];

  return [
    {
      bookedAt: {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      },
    } as Filter,
  ];
}

function searchCondition(search?: string): Filter[] {
  if (!search) return [];
  return [{ $text: { $search: search } } as Filter];
}

/**
 * Newest-first page boundary over `(bookedAt, id)`.
 *
 * A cursor on `bookedAt` alone would drop or repeat rows sharing a millisecond, which a
 * batch of standing orders produces by the dozen. The `$or` says "strictly older, or the
 * same instant but a lower id" — a total order, so the boundary is exact and a row
 * inserted between page one and page two cannot displace anything.
 *
 * An unreadable cursor is rejected rather than ignored: silently serving page one when
 * the client asked for page four is a worse failure than an error.
 */
function cursorCondition(cursor?: string): Filter[] {
  if (!cursor) return [];

  const anchor = decodeCursor(cursor);
  if (!anchor) throw unreadableCursor();

  const bookedAt = new Date(anchor.sortValue);
  if (Number.isNaN(bookedAt.getTime())) throw unreadableCursor();

  return [
    {
      $or: [{ bookedAt: { $lt: bookedAt } }, { bookedAt, id: { $lt: anchor.id } }],
    } as Filter,
  ];
}

/** Shared so the two ways a cursor can be malformed produce one answer, not two. */
export function unreadableCursor(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'The pagination cursor is not one this API issued.',
  });
}
