import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { DepositDetail } from '../../_components/deposit-detail';

export const metadata: Metadata = {
  title: 'Fixed deposit',
  description:
    'What this deposit has earned, what it will be worth, and what taking it back early costs.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One fixed deposit. */
export default async function DepositPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.save.deposit(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your fixed deposit"
        description="What it has earned so far, and what it will be worth."
      />
      <DepositDetail depositId={id} />
    </div>
  );
}
