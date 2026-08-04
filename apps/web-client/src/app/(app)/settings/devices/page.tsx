import type { Metadata } from 'next';

import { DevicesPanel, SettingsNav, TrustedDevices } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Where you are signed in, and how to sign out everywhere else in one press.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Sessions and recognised devices. */
export default async function DevicesPage() {
  await guardScreen(laneRoutes.settings.devices);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Devices"
        description="If anything here is not you, sign it out and change your password."
      >
        <SettingsNav />
      </PageHeader>
      <DevicesPanel />
      <TrustedDevices />
    </div>
  );
}
