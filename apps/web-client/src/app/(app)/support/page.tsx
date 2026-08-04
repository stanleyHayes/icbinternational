import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { SupportNav } from './_components/support-nav';
import { TicketsPanel } from './_components/tickets-panel';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Message us, dispute a payment or report fraud. We answer in the app.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The customer's conversations with the bank. */
export default async function SupportPage() {
  await guardScreen(laneRoutes.support.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Support"
        description="Message us about anything. If money is leaving your account right now, call 0800 460 0460 instead."
      >
        <SupportNav />
      </PageHeader>
      <TicketsPanel />
    </div>
  );
}
