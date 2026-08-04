/**
 * Where the insight screens live, and how a window is carried in a link.
 *
 * The period is a query parameter rather than a path segment because it is a filter, and filters
 * on the money screens live in the query string so a link reproduces the view exactly.
 */

import type { Route } from 'next';

import { appRoutes } from '@/lib/routes';

import { DEFAULT_PERIOD, PERIOD_PARAM, type Period } from './period';

/** Insights, optionally opened on a particular window. */
export function insightsRoute(period: Period = DEFAULT_PERIOD): Route {
  const query = new URLSearchParams({ [PERIOD_PARAM]: period });
  return `${appRoutes.insights}?${query.toString()}` as Route;
}
