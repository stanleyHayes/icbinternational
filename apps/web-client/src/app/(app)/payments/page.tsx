import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { MandatesPanel } from './_components/mandates-panel';
import { PaymentsNav } from './_components/payments-nav';
import { ReceiptsPanel } from './_components/receipts-panel';

export const metadata: Metadata = {
  title: 'Payments',
  description: 'Pay a bill, top up a phone, ask someone for money and manage your direct debits.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The payments overview. */
export default async function PaymentsPage() {
  await guardScreen(laneRoutes.payments.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Bills, top-ups, requests and direct debits — everything that is not a transfer."
      >
        <PaymentsNav />
      </PageHeader>
      <MandatesPanel />
      <ReceiptsPanel />
    </div>
  );
}
