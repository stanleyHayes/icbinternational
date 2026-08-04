/**
 * Where the account screens live.
 *
 * `lib/routes.ts` names `/accounts` and is owned by the shell lane; the screens beneath it are
 * named here so this workstream can add and move them without editing a shared file. One place,
 * one change, and no `<Link>` with a hand-typed path in it.
 *
 * The cast follows the pattern `lib/routes.ts` documents: `typedRoutes` narrows `Route` to the
 * paths Next has already generated types for, which on a first build does not include these yet.
 */

import type { Route } from 'next';

import { appRoutes } from '@/lib/routes';

function asRoute(path: string): Route {
  return path as Route;
}

/** Every account the customer holds. */
export const accountsRoute: Route = appRoutes.accounts;

/** One account: balance, details and its recent activity. */
export function accountRoute(accountId: string): Route {
  return asRoute(`${appRoutes.accounts}/${accountId}`);
}

/** An account's statement archive. */
export function statementsRoute(accountId: string): Route {
  return asRoute(`${appRoutes.accounts}/${accountId}/statements`);
}

/** The closure journey for an account. */
export function closeAccountRoute(accountId: string): Route {
  return asRoute(`${appRoutes.accounts}/${accountId}/close`);
}

/** Opening a new account. */
export const openAccountRoute: Route = asRoute(`${appRoutes.accounts}/new`);
