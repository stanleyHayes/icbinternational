/**
 * Reading a whole filtered result set, rather than a page of one.
 *
 * Three things need the complete set instead of the first twenty-five rows: the facet counts
 * beside the list, the CSV the customer downloads, and every category total on Insights. If each
 * of those computed its own figure from its own slice of data they would disagree, and a
 * disagreement between "Groceries £274.50" on one screen and the sum of the rows on another is
 * the kind of thing that ends in a complaint. So they all call this, with the same query.
 *
 * It is bounded. A window that would need more than {@link MAX_PAGES} pages stops and says so,
 * and the screens that use it tell the customer to narrow the dates rather than quietly showing
 * a total that is missing the oldest rows. Silently truncating a total is worse than not having
 * one.
 */

import { MAX_PAGE_SIZE, type Transaction } from '@reliance/contracts';

import { browserApi } from '@/lib/api';

import type { TransactionQuery } from './filters';

/**
 * Pages fetched before the loader gives up.
 *
 * At the contract's maximum page size this is 2,000 movements — comfortably more than a busy
 * current account books in a quarter, and few enough that a mistyped date range cannot turn one
 * screen into forty requests.
 */
export const MAX_PAGES = 20;

/** The most movements {@link collectTransactions} will return. */
export const COLLECTION_LIMIT = MAX_PAGES * MAX_PAGE_SIZE;

/** A complete — or deliberately incomplete — result set. */
export interface Collection {
  readonly transactions: readonly Transaction[];
  /** True when the window held more than {@link COLLECTION_LIMIT} movements. */
  readonly truncated: boolean;
}

/**
 * Walks the cursor to the end of a filtered feed.
 *
 * Sequential by necessity: each cursor is only knowable once the previous page has answered.
 * Parallelising it would mean guessing offsets, which is precisely what cursor pagination exists
 * to stop.
 *
 * @param query the same filter object the visible list is built from.
 */
export async function collectTransactions(query: TransactionQuery): Promise<Collection> {
  const api = browserApi();
  const transactions: Transaction[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.transactions.list({
      ...query,
      limit: MAX_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    transactions.push(...result.data);
    if (!result.page.hasMore || !result.page.cursor) return { transactions, truncated: false };
    cursor = result.page.cursor;
  }

  return { transactions, truncated: true };
}
