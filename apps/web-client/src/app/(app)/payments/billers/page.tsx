import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { BillerCatalogue } from '../_components/biller-catalogue';
import { PaymentsNav } from '../_components/payments-nav';

export const metadata: Metadata = {
  title: 'Pay a bill',
  description: 'Search the companies we can pay directly and settle a bill in a few taps.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The biller directory. */
export default async function BillersPage() {
  await guardScreen(laneRoutes.payments.billers);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pay a bill" description="Search for the company you need to pay.">
        <PaymentsNav />
      </PageHeader>
      <BillerCatalogue />
    </div>
  );
}
