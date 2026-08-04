/**
 * Transaction filters live in the URL, not in component state.
 *
 * The reason is support, not purity. When somebody phones about "the payment to Thames Water in
 * March", the useful thing they can do is send the link they are looking at — and the useful thing
 * an adviser can do is send one back. That only works if the address bar fully determines the
 * view, which means every filter round-trips through this module and nothing is held anywhere else.
 *
 * Amounts are carried as **minor units** because that is what the contract's query accepts and
 * because `min=1000` is exact where `min=10.00` invites a locale to reinterpret it. The filter
 * bar converts to and from major units at the input, using `@reliance/money`.
 */

import {
  EntryType,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
  type ListTransactionsQuery,
} from '@reliance/contracts';

/** The complete state of the transactions view. */
export interface TransactionFilters {
  readonly accountId: string | null;
  readonly direction: TransactionDirection | null;
  readonly status: TransactionStatus | null;
  readonly category: SpendCategory | null;
  readonly type: EntryType | null;
  /** Free text over description, reference and counterparty. */
  readonly search: string;
  /** Calendar dates, `YYYY-MM-DD`, inclusive at both ends. */
  readonly from: string | null;
  readonly to: string | null;
  /** Minor units, unsigned. Compared against the magnitude of the movement. */
  readonly minAmount: string | null;
  readonly maxAmount: string | null;
}

/** No filters at all: every movement on every account. */
export const NO_FILTERS: TransactionFilters = {
  accountId: null,
  direction: null,
  status: null,
  category: null,
  type: null,
  search: '',
  from: null,
  to: null,
  minAmount: null,
  maxAmount: null,
};

/** Query-string keys. Short, stable and safe to put in a support ticket. */
export const FILTER_PARAM = {
  account: 'account',
  direction: 'direction',
  status: 'status',
  category: 'category',
  type: 'type',
  search: 'q',
  from: 'from',
  to: 'to',
  min: 'min',
  max: 'max',
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINOR_UNITS = /^\d+$/;
const SEARCH_MAX_LENGTH = 120;

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | null {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : null;
}

function matching(pattern: RegExp, raw: string | null): string | null {
  return raw !== null && pattern.test(raw) ? raw : null;
}

/**
 * Reads filters out of a query string, discarding anything malformed.
 *
 * Silently discarding is deliberate: a hand-edited or truncated link should show the customer
 * their transactions with the filters it could understand, not an error page.
 */
export function readFilters(params: URLSearchParams): TransactionFilters {
  return {
    accountId: params.get(FILTER_PARAM.account) || null,
    direction: oneOf(Object.values(TransactionDirection), params.get(FILTER_PARAM.direction)),
    status: oneOf(Object.values(TransactionStatus), params.get(FILTER_PARAM.status)),
    category: oneOf(Object.values(SpendCategory), params.get(FILTER_PARAM.category)),
    type: oneOf(Object.values(EntryType), params.get(FILTER_PARAM.type)),
    search: (params.get(FILTER_PARAM.search) ?? '').slice(0, SEARCH_MAX_LENGTH),
    from: matching(ISO_DATE, params.get(FILTER_PARAM.from)),
    to: matching(ISO_DATE, params.get(FILTER_PARAM.to)),
    minAmount: matching(MINOR_UNITS, params.get(FILTER_PARAM.min)),
    maxAmount: matching(MINOR_UNITS, params.get(FILTER_PARAM.max)),
  };
}

/** Serialises filters back to a query string, omitting everything unset. */
export function writeFilters(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: readonly (readonly [string, string | null])[] = [
    [FILTER_PARAM.account, filters.accountId],
    [FILTER_PARAM.direction, filters.direction],
    [FILTER_PARAM.status, filters.status],
    [FILTER_PARAM.category, filters.category],
    [FILTER_PARAM.type, filters.type],
    [FILTER_PARAM.search, filters.search.trim() || null],
    [FILTER_PARAM.from, filters.from],
    [FILTER_PARAM.to, filters.to],
    [FILTER_PARAM.min, filters.minAmount],
    [FILTER_PARAM.max, filters.maxAmount],
  ];

  for (const [key, value] of entries) if (value) params.set(key, value);
  return params;
}

/** The query string for a set of filters, ready to append to a path. */
export function filtersToSearch(filters: TransactionFilters): string {
  const query = writeFilters(filters).toString();
  return query ? `?${query}` : '';
}

const DAY_STARTS = 'T00:00:00.000Z';
const DAY_ENDS = 'T23:59:59.999Z';

/**
 * The filter half of the contract's list query — everything except the page cursor.
 *
 * Paging is the caller's business: the infinite feed walks cursors, the totals loader walks them
 * to exhaustion, and both start from the identical filter object built here.
 */
export type TransactionQuery = Omit<ListTransactionsQuery, 'cursor' | 'limit'>;

/**
 * Turns filters into the contract's list query.
 *
 * The dates widen to cover whole days at both ends. A customer who filters "1 March to 1 March"
 * means that day, not the single instant at midnight, and an exclusive upper bound would drop
 * every payment they actually made.
 */
export function toListQuery(filters: TransactionFilters): TransactionQuery {
  const candidates: Readonly<Record<string, string | null>> = {
    accountId: filters.accountId,
    direction: filters.direction,
    status: filters.status,
    category: filters.category,
    type: filters.type,
    search: filters.search.trim() || null,
    from: filters.from && `${filters.from}${DAY_STARTS}`,
    to: filters.to && `${filters.to}${DAY_ENDS}`,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
  };

  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidates)) if (value) query[key] = value;
  return query as TransactionQuery;
}

/** How many filters are narrowing the view. Drives the "3 filters" badge and the clear button. */
export function activeFilterCount(filters: TransactionFilters): number {
  return [...writeFilters(filters).keys()].length;
}

/** True when nothing is filtered — the customer is looking at everything. */
export function isUnfiltered(filters: TransactionFilters): boolean {
  return activeFilterCount(filters) === 0;
}

/** Filters scoped to one account and nothing else. */
export function forAccount(accountId: string): TransactionFilters {
  return { ...NO_FILTERS, accountId };
}
