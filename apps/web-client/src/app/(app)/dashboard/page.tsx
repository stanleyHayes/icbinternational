import type { Metadata } from 'next';

import { appRoutes } from '@/lib/routes';
import { requireSession } from '@/lib/session';

import { DashboardHeader } from './dashboard-header';
import { DashboardScreen } from './dashboard-screen';

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your balances, recent activity and anything that needs your attention.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The signed-in home screen.
 *
 * Server-rendered only as far as the session guard: everything below reads live balances, and a
 * cached snapshot of somebody's money is the one thing this app must never produce.
 */
export default async function DashboardPage() {
  await requireSession(appRoutes.dashboard);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader />
      <DashboardScreen />
    </div>
  );
}
