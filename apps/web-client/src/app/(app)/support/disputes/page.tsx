import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { DisputesPanel } from '../_components/disputes-panel';
import { SupportNav } from '../_components/support-nav';

export const metadata: Metadata = {
  title: 'Disputes',
  description: 'Payments you have asked us to investigate, and how each one is going.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Disputes the customer has raised. */
export default async function DisputesPage() {
  await guardScreen(laneRoutes.support.disputes);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Disputes"
        description="If a payment is wrong, we will take it up with the merchant or their bank on your behalf."
      >
        <SupportNav />
      </PageHeader>
      <DisputesPanel />
    </div>
  );
}
