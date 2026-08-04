import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { TicketThread } from '../_components/ticket-thread';

export const metadata: Metadata = {
  title: 'Your message',
  description: 'The whole conversation, and somewhere to reply.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One support conversation. */
export default async function TicketPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.support.ticket(id));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Your message" description="Everything said so far, in order." />
      <TicketThread ticketId={id} />
    </div>
  );
}
