import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { BorrowNav } from '../_components/borrow-nav';
import { OverdraftForm } from '../_components/overdraft-form';

export const metadata: Metadata = {
  title: 'Overdraft',
  description: 'Ask for an arranged overdraft on your current account.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Requesting an arranged overdraft. */
export default async function OverdraftPage() {
  await guardScreen(laneRoutes.borrow.overdraft);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overdraft"
        description="A buffer for the days a payment lands before your pay does."
      >
        <BorrowNav />
      </PageHeader>
      <OverdraftForm />
    </div>
  );
}
