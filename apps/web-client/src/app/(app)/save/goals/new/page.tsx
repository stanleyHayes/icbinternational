import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { GoalForm } from '../../_components/goal-form';

export const metadata: Metadata = {
  title: 'Start a goal',
  description: 'Name what you are saving for, set a target, and track how close you are.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Creating a savings goal. */
export default async function NewGoalPage() {
  await guardScreen(laneRoutes.save.newGoal);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Start a goal"
        description="Name it, set a target, and we track the rest."
      />
      <GoalForm />
    </div>
  );
}
