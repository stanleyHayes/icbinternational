import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { ApplicationDetail } from '../../_components/application-detail';

export const metadata: Metadata = {
  title: 'Loan application',
  description: 'Where your application has got to, and the offer once there is one.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One loan application. */
export default async function ApplicationPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.borrow.application(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your application"
        description="Where it has got to, and what we are offering."
      />
      <ApplicationDetail applicationId={id} />
    </div>
  );
}
