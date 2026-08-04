import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { AddPayeeForm } from '../_components/add-payee-form';

export const metadata: Metadata = {
  title: 'Add a payee',
  description: 'Save someone new to pay, with their name confirmed by their own bank first.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Saving a new payee. */
export default async function AddPayeePage() {
  await guardScreen(laneRoutes.payees.add);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Add a payee"
        description="Enter their account details once and pay them in two taps from then on."
      />
      <AddPayeeForm />
    </div>
  );
}
