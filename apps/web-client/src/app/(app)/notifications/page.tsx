import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { NotificationCentre } from './_components/notification-centre';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Everything we have told you, newest first, and how to change what we send.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The notification centre. */
export default async function NotificationsPage() {
  await guardScreen(laneRoutes.notifications);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="We will always tell you about anything affecting your security, whatever else you switch off."
      />
      <NotificationCentre />
    </div>
  );
}
