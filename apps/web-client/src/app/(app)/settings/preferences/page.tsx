import type { Metadata } from 'next';

import { PreferencesPanel, SettingsNav } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Preferences',
  description: 'Language, and whether the app follows your device’s light or dark setting.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Appearance and language. */
export default async function PreferencesPage() {
  await guardScreen(laneRoutes.settings.preferences);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Preferences" description="How the app looks and which language it uses.">
        <SettingsNav />
      </PageHeader>
      <PreferencesPanel />
    </div>
  );
}
