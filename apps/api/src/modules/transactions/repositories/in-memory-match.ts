import {
  type TransactionListQuery,
  type TransactionRangeQuery,
  type TransactionRecord,
} from './transaction.store.js';

/**
 * In-memory equivalents of the Mongo query the repository builds.
 *
 * These live apart from the fake store so the two halves can be read against each other:
 * every clause in `transaction-filter.ts` has a counterpart here, and a filter added on
 * one side without the other is visible as an asymmetry rather than as a test that
 * silently stops covering something.
 */

/** True when the row satisfies every clause of the customer's filter set. */
export function matchesListQuery(row: TransactionRecord, query: TransactionListQuery): boolean {
  return (
    row.userId === query.userId &&
    matchesEquality(row, query) &&
    withinAmount(row, query) &&
    withinDates(row, query.from, query.to) &&
    matchesSearch(row, query.search)
  );
}

/** True when the row falls inside an oldest-first keyset window. */
export function matchesRangeQuery(row: TransactionRecord, query: TransactionRangeQuery): boolean {
  if (row.userId !== query.userId) return false;
  if (query.accountId && row.accountId !== query.accountId) return false;
  if (query.afterId && row.id <= query.afterId) return false;
  return withinDates(row, query.from, query.to);
}

/** Newest first, with the ULID id as the tie-break — the list ordering. */
export function newestFirst(left: TransactionRecord, right: TransactionRecord): number {
  const byTime = right.bookedAt.getTime() - left.bookedAt.getTime();
  if (byTime !== 0) return byTime;
  return right.id < left.id ? -1 : 1;
}

/** Oldest first, keyed on the ULID alone — the range-scan ordering. */
export function oldestFirst(left: TransactionRecord, right: TransactionRecord): number {
  return left.id < right.id ? -1 : 1;
}

function matchesEquality(row: TransactionRecord, query: TransactionListQuery): boolean {
  const checks: [unknown, unknown][] = [
    [query.accountId, row.accountId],
    [query.direction, row.direction],
    [query.status, row.status],
    [query.category, row.category],
    [query.type, row.type],
  ];
  return checks.every(([wanted, actual]) => wanted === undefined || wanted === actual);
}

/**
 * Bounds compared as `bigint`.
 *
 * The repository asks MongoDB for `$toDecimal`; here the equivalent exactness comes from
 * `BigInt`, not from `Number`. Comparing minor units as doubles would agree with Mongo
 * for every amount in a test and disagree in production, which is the worst possible
 * place for a fake to be approximately right.
 */
function withinAmount(row: TransactionRecord, query: TransactionListQuery): boolean {
  const amount = BigInt(row.amount.amount);
  if (query.minAmount !== undefined && amount < BigInt(query.minAmount)) return false;
  return !(query.maxAmount !== undefined && amount > BigInt(query.maxAmount));
}

function withinDates(row: TransactionRecord, from?: Date, to?: Date): boolean {
  if (from && row.bookedAt < from) return false;
  return !(to && row.bookedAt > to);
}

/**
 * Whole-word, case-insensitive match over the three text-indexed fields.
 *
 * MongoDB's text index tokenises and stems; this does not, and cannot without shipping a
 * stemmer. What it does reproduce is the property tests rely on — that a term matches on
 * a word boundary in any of the three fields and nowhere else — so a substring that Mongo
 * would not match does not match here either.
 */
function matchesSearch(row: TransactionRecord, search?: string): boolean {
  if (!search) return true;

  const haystack = [row.description, row.reference ?? '', row.counterparty?.name ?? '']
    .join(' ')
    .toLowerCase();
  const words = new Set(haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean));

  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((term) => words.has(term));
}
