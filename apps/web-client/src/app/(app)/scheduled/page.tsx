import type { Metadata } from 'next';

import { LinkButton, PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { ScheduledScreen } from './_components/scheduled-screen';

export const metadata: Metadata = {
  title: 'Scheduled payments',
  description: 'Standing orders and future-dated payments, with the month ahead at a glance.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Standing orders, as a list and as a calendar. */
export default async function ScheduledPage() {
  await guardScreen(laneRoutes.scheduled.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Scheduled payments"
        description="Payments that repeat on a schedule you set. Skip one, pause them all, or stop a standing order whenever you like."
        actions={
          <LinkButton href={laneRoutes.scheduled.bulk} variant="secondary">
            Pay many people at once
          </LinkButton>
        }
      />
      <ScheduledScreen />
    </div>
  );
}
