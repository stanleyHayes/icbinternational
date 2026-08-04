/**
 * Sorting for Table.
 *
 * Comparison is defined over `string | number | bigint` and the bigint case is the reason this
 * exists: transaction amounts are bigint minor units, and a sort that coerced them to `number`
 * would silently reorder anything above 2^53 — which in minor units is a sum a corporate account
 * can genuinely hold.
 */

/** A value a column can be sorted by. */
export type SortValue = string | number | bigint;

export type SortDirection = 'asc' | 'desc';

/** Which column is sorted, and which way. */
export interface TableSort {
  readonly columnId: string;
  readonly direction: SortDirection;
}

/** `aria-sort` needs the long form; the DOM has no shorthand. */
export const ARIA_SORT: Readonly<Record<SortDirection, 'ascending' | 'descending'>> = {
  asc: 'ascending',
  desc: 'descending',
};

const BEFORE = -1;
const AFTER = 1;
const SAME = 0;

/** Numeric ordering for numbers and bigints, locale-aware collation for strings. */
export function compareValues(left: SortValue, right: SortValue): number {
  if (typeof left === 'string' || typeof right === 'string') {
    return String(left).localeCompare(String(right));
  }
  if (left < right) return BEFORE;
  if (left > right) return AFTER;
  return SAME;
}

/**
 * Returns a sorted copy, or the original array when the column cannot be sorted.
 *
 * `Array#sort` mutates, and mutating a `rows` prop would reorder the caller's own state — a bug
 * that only shows up once the same array is rendered somewhere else.
 */
export function sortRows<T>(
  rows: readonly T[],
  valueOf: ((row: T) => SortValue) | undefined,
  direction: SortDirection,
): readonly T[] {
  if (!valueOf) return rows;
  const factor = direction === 'asc' ? AFTER : BEFORE;
  return [...rows].sort((left, right) => factor * compareValues(valueOf(left), valueOf(right)));
}
