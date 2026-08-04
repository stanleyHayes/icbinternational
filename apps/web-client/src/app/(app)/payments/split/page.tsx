import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PaymentsNav } from '../_components/payments-nav';
import { SplitBillForm } from '../_components/split-bill-form';

export const metadata: Metadata = {
  title: 'Split a bill',
  description: 'Split a total between several people, weighted by shares, with a request each.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Splitting a bill. */
export default async function SplitPage() {
  await guardScreen(laneRoutes.payments.split);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Split a bill"
        description="Everyone gets their own link. Shares handle the person who had two courses."
      >
        <PaymentsNav />
      </PageHeader>
      <SplitBillForm />
    </div>
  );
}
