import type { Metadata } from 'next';

import { NotificationPreferencesPanel, SettingsNav } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Notification preferences',
  description: 'Choose how we contact you for each kind of message.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The category-by-channel preference matrix. */
export default async function NotificationSettingsPage() {
  await guardScreen(laneRoutes.settings.notifications);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="We will always tell you about anything that affects your security."
      >
        <SettingsNav />
      </PageHeader>
      <NotificationPreferencesPanel />
    </div>
  );
}
