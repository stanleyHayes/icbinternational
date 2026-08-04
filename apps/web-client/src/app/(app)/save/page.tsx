import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { GoalsPanel } from './_components/goals-panel';
import { SaveNav } from './_components/save-nav';

export const metadata: Metadata = {
  title: 'Save',
  description:
    'Savings goals with round-ups, and fixed deposits at a rate held for the whole term.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Savings goals. */
export default async function SavePage() {
  await guardScreen(laneRoutes.save.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Save"
        description="Put money aside for something in particular, or lock it away at a fixed rate."
      >
        <SaveNav />
      </PageHeader>
      <GoalsPanel />
    </div>
  );
}
