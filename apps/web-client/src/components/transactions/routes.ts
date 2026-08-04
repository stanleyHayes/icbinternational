/**
 * Where the transaction screens live.
 *
 * `lib/routes.ts` names the destinations the shell links to and is owned by the shell lane; it
 * has no entry for the feed or for a single movement. Rather than edit a file this workstream
 * does not own, the two paths are named here — once — so a future move is still a one-line change
 * and no `<Link>` anywhere carries a hand-typed string.
 *
 * `typedRoutes` narrows `Route` to the paths Next has already generated types for, which on a
 * first build does not yet include these. The cast is the same one `lib/routes.ts` documents: an
 * assertion that the route exists, not a claim that it has been checked.
 */

import type { Route } from 'next';

import { filtersToSearch, type TransactionFilters } from './filters';

/** Base path of the transaction feed. */
export const TRANSACTIONS_PATH = '/transactions';

function asRoute(path: string): Route {
  return path as Route;
}

/**
 * The feed, optionally pre-filtered.
 *
 * Every link into the list — a category slice on Insights, "See all activity" on the dashboard,
 * an account's own history — goes through here, which is what makes a shared link reproduce the
 * exact view the sender was looking at.
 */
export function transactionsRoute(filters?: TransactionFilters): Route {
  return asRoute(`${TRANSACTIONS_PATH}${filters ? filtersToSearch(filters) : ''}`);
}

/** One movement, with its receipt. */
export function transactionRoute(transactionId: string): Route {
  return asRoute(`${TRANSACTIONS_PATH}/${transactionId}`);
}
