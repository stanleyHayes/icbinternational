import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader, RouteLoading } from '@/components/shell';
import { TRANSACTIONS_PATH } from '@/components/transactions/routes';
import { requireSession } from '@/lib/session';

import { TransactionsScreen } from './transactions-screen';

export const metadata: Metadata = {
  title: 'Activity',
  description: 'Search, filter and download every payment into and out of your accounts.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Every movement on every account.
 *
 * The screen reads its filters from the query string, which requires a Suspense boundary around
 * anything calling `useSearchParams`. The fallback is the same shape as the loaded page, so the
 * heading does not move when the rows arrive.
 */
export default async function TransactionsPage() {
  await requireSession(TRANSACTIONS_PATH);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Everything that has gone in or out, with the balance after each one. Filters are kept in the address bar, so you can share exactly what you are looking at."
      />
      <Suspense fallback={<RouteLoading rows={6} withHeader={false} />}>
        <TransactionsScreen />
      </Suspense>
    </div>
  );
}
