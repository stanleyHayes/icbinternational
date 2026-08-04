import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PaymentsNav } from '../_components/payments-nav';
import { ReceiptsPanel } from '../_components/receipts-panel';

export const metadata: Metadata = {
  title: 'Bill receipts',
  description: 'Every bill you have paid through us, with the biller’s own receipt.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Bill payment receipts. */
export default async function ReceiptsPage() {
  await guardScreen(laneRoutes.payments.receipts);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bill receipts"
        description="Including the biller’s own reference, which is what they ask for if anything goes missing."
      >
        <PaymentsNav />
      </PageHeader>
      <ReceiptsPanel />
    </div>
  );
}
