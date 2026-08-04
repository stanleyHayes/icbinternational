import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { OrderForm } from '../_components/order-form';

export const metadata: Metadata = {
  title: 'Set up a standing order',
  description: 'Pay the same person the same amount on a schedule, until you stop it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Creating a standing order. */
export default async function NewOrderPage() {
  await guardScreen(laneRoutes.scheduled.add);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Set up a standing order"
        description="Choose who, how much and how often. You can change or stop it at any time."
      />
      <OrderForm />
    </div>
  );
}
