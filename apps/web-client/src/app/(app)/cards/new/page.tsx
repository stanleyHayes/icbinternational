import type { Metadata } from 'next';

import { OrderCardForm } from '@/components/cards';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Order a card',
  description: 'Order a virtual card ready in seconds, or a physical card posted to you.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Ordering a virtual or physical card. */
export default async function OrderCardPage() {
  await guardScreen(laneRoutes.cards.order);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Order a card"
        description="A virtual card is ready in seconds. A physical card arrives in the post within five working days."
      />
      <OrderCardForm />
    </div>
  );
}
