import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { MandatesPanel } from '../_components/mandates-panel';
import { PaymentsNav } from '../_components/payments-nav';

export const metadata: Metadata = {
  title: 'Direct debits',
  description: 'Everything a company can collect from you automatically, and how to stop it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Direct debit mandates. */
export default async function MandatesPage() {
  await guardScreen(laneRoutes.payments.mandates);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Direct debits"
        description="Pause one for a month, or cancel it outright. Cancelling means the company has to ask again."
      >
        <PaymentsNav />
      </PageHeader>
      <MandatesPanel />
    </div>
  );
}
