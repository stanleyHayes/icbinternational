import type { Metadata } from 'next';

import { PrivacyPanel, SettingsNav } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Get a copy of everything we hold about you, or close your account.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Data export and account closure. */
export default async function PrivacyPage() {
  await guardScreen(laneRoutes.settings.privacy);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Privacy" description="Your data is yours. So is the decision to leave.">
        <SettingsNav />
      </PageHeader>
      <PrivacyPanel />
    </div>
  );
}
