import 'server-only';

/**
 * The guard every screen in this lane runs before it renders.
 *
 * The signed-in layout guards too, and that is the point: a route that only checks the session in
 * a layout is one refactor away from being reachable without one. `readSession` is memoised for
 * the request, so the second check costs nothing.
 *
 * The destination is carried into the sign-in URL, so a customer whose session ended on a
 * half-written transfer comes back to the transfer rather than to the dashboard.
 */

import type { Route } from 'next';

import { requireSession, type DashboardSession } from '@/lib/session';

/**
 * Requires a session, or redirects to sign-in remembering where the customer was.
 *
 * @param destination the route being rendered.
 */
export async function guardScreen(destination: Route): Promise<DashboardSession> {
  return requireSession(destination);
}
