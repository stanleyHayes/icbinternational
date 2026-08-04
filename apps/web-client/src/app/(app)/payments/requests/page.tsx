import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PaymentsNav } from '../_components/payments-nav';
import { RequestsPanel } from '../_components/requests-panel';

export const metadata: Metadata = {
  title: 'Request money',
  description: 'Ask someone for money with a link they can pay from any bank.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Requesting money. */
export default async function RequestsPage() {
  await guardScreen(laneRoutes.payments.requests);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Request money"
        description="We give you a link. Whoever you send it to can pay it from any bank."
      >
        <PaymentsNav />
      </PageHeader>
      <RequestsPanel />
    </div>
  );
}
