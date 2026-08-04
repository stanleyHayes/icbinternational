import type { Metadata } from 'next';

import { LinkButton, PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PayeesScreen } from './_components/payees-screen';

export const metadata: Metadata = {
  title: 'Payees',
  description: 'The people and businesses you have saved, ready to pay again in two taps.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Everyone the customer has saved. */
export default async function PayeesPage() {
  await guardScreen(laneRoutes.payees.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payees"
        description="Save the people and businesses you pay regularly. We check the name with their bank before you send anything."
        actions={<LinkButton href={laneRoutes.payees.add}>Add a payee</LinkButton>}
      />
      <PayeesScreen />
    </div>
  );
}
