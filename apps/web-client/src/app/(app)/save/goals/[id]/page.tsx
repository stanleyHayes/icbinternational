import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { GoalDetail } from '../../_components/goal-detail';

export const metadata: Metadata = {
  title: 'Savings goal',
  description: 'How close you are, and how to add to it or take money back out.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One savings goal. */
export default async function GoalPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.save.goal(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your goal" description="How close you are, and what to do next." />
      <GoalDetail goalId={id} />
    </div>
  );
}
