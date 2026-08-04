import type { Metadata } from 'next';

import { CardWall } from '@/components/cards';
import { LinkButton, PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Cards',
  description: 'Freeze a card, set where it works, see your card number and order a replacement.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Every card the customer holds. */
export default async function CardsPage() {
  await guardScreen(laneRoutes.cards.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cards"
        description="Freeze a card the moment you cannot find it, choose where it works, and see your details whenever you need them."
        actions={<LinkButton href={laneRoutes.cards.order}>Order a card</LinkButton>}
      />
      <CardWall />
    </div>
  );
}
