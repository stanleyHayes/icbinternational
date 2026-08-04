import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { DepositsPanel } from '../_components/deposits-panel';
import { SaveNav } from '../_components/save-nav';

export const metadata: Metadata = {
  title: 'Fixed deposits',
  description: 'Lock money away for a set term at a rate fixed for the whole of it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Fixed deposits, and today's rate board. */
export default async function DepositsPage() {
  await guardScreen(laneRoutes.save.deposits);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fixed deposits"
        description="A rate held for the whole term. You can take the money back early, and we tell you exactly what that costs first."
      >
        <SaveNav />
      </PageHeader>
      <DepositsPanel />
    </div>
  );
}
