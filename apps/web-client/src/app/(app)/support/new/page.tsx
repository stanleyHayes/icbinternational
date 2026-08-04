import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { NewTicketForm } from '../_components/new-ticket-form';

export const metadata: Metadata = {
  title: 'Message us',
  description: 'Start a conversation with us. Everything stays in one place.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Opening a support ticket. */
export default async function NewTicketPage() {
  await guardScreen(laneRoutes.support.newTicket);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Message us"
        description="Tell us what has happened and we will pick it up."
      />
      <NewTicketForm />
    </div>
  );
}
