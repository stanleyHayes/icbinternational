import type { Metadata } from 'next';

import { PasswordForm, SettingsNav, TwoFactorPanel } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

export const metadata: Metadata = {
  title: 'Security',
  description: 'Your password, the second step when you sign in, and your recovery codes.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Password and second-factor settings. */
export default async function SecurityPage() {
  await guardScreen(laneRoutes.settings.security);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Security"
        description="The things that stand between somebody else and your money."
      >
        <SettingsNav />
      </PageHeader>
      <PasswordForm />
      <TwoFactorPanel />
    </div>
  );
}
