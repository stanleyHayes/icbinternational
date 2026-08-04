import type { Metadata } from 'next';

import { SettingsNav } from '@/components/settings';
import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { AccountLimits } from '../_components/account-limits';

export const metadata: Metadata = {
  title: 'Limits',
  description: 'How much you can move in a day, and how much of that is left.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Daily limits and remaining allowance. */
export default async function LimitsPage() {
  await guardScreen(laneRoutes.settings.limits);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Limits"
        description="Limits exist to slow a fraudster down. If one is in your way for a genuine payment, message us and we will look at it."
      >
        <SettingsNav />
      </PageHeader>
      <AccountLimits />
    </div>
  );
}
