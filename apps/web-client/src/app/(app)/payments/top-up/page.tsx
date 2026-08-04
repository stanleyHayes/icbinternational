import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PaymentsNav } from '../_components/payments-nav';
import { TopUpForm } from '../_components/top-up-form';

export const metadata: Metadata = {
  title: 'Top up a phone',
  description: 'Buy airtime or a data bundle for any UK mobile number.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Airtime and data top-ups. */
export default async function TopUpPage() {
  await guardScreen(laneRoutes.payments.topUp);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Top up a phone" description="Airtime or data, usually within a minute.">
        <PaymentsNav />
      </PageHeader>
      <TopUpForm />
    </div>
  );
}
