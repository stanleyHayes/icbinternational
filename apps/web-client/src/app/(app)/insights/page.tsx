import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader, RouteLoading } from '@/components/shell';
import { appRoutes } from '@/lib/routes';
import { requireSession } from '@/lib/session';

import { InsightsScreen } from './insights-screen';

export const metadata: Metadata = {
  title: 'Insights',
  description: 'Where your money goes, how it moves month to month, and what is due next.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Spending, cash flow, budgets and recurring payments.
 *
 * The window is read from the query string, which needs a Suspense boundary around anything
 * calling `useSearchParams`. The fallback reserves the same space as the panels, so the page does
 * not reflow when the figures land.
 */
export default async function InsightsPage() {
  await requireSession(appRoutes.insights);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights"
        description="Every figure here is the sum of the payments behind it — open any category to see them."
      />
      <Suspense fallback={<RouteLoading rows={4} withHeader={false} />}>
        <InsightsScreen />
      </Suspense>
    </div>
  );
}
