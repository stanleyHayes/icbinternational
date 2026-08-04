import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { FraudForm } from '../_components/fraud-form';
import { SupportNav } from '../_components/support-nav';

export const metadata: Metadata = {
  title: 'Report fraud',
  description: 'Freeze your cards and put a case in front of our fraud team within minutes.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Reporting fraud. */
export default async function FraudPage() {
  await guardScreen(laneRoutes.support.fraud);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Report fraud"
        description="Tell us as much or as little as you know. Acting quickly matters far more than getting the details right."
      >
        <SupportNav />
      </PageHeader>
      <FraudForm />
    </div>
  );
}
