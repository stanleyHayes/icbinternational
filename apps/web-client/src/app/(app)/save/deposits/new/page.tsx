import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { DepositForm } from '../../_components/deposit-form';

export const metadata: Metadata = {
  title: 'Open a fixed deposit',
  description: 'Choose a term and lock in the rate for the whole of it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Opening a fixed deposit. */
export default async function NewDepositPage() {
  await guardScreen(laneRoutes.save.newDeposit);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Open a fixed deposit"
        description="Pick a term, see the rate, and lock it in for the whole of it."
      />
      <DepositForm />
    </div>
  );
}
