import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { BulkWizard } from '../_components/bulk-wizard';

export const metadata: Metadata = {
  title: 'Pay many people at once',
  description: 'Upload a payment file, check every row, then send the whole batch in one go.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The bulk payment wizard. */
export default async function BulkPage() {
  await guardScreen(laneRoutes.scheduled.bulk);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pay many people at once"
        description="Upload a file, see exactly what is wrong with any row before anything is sent, then approve the batch."
      />
      <BulkWizard />
    </div>
  );
}
