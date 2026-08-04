import type { Metadata } from 'next';

import { CardDetail } from '@/components/cards';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Card',
  description:
    'Manage one card: freeze it, set a PIN, choose where it works and see what it has spent.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One card. */
export default async function CardDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.cards.detail(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your card" description="Everything you can do with this card." />
      <CardDetail cardId={id} />
    </div>
  );
}
