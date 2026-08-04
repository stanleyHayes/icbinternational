import type { Metadata } from 'next';

import { ProfileForm, SettingsNav } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your details, security, limits and how we contact you.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The customer's own details. */
export default async function SettingsPage() {
  await guardScreen(laneRoutes.settings.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your details, and how the bank behaves for you.">
        <SettingsNav />
      </PageHeader>
      <ProfileForm />
    </div>
  );
}
