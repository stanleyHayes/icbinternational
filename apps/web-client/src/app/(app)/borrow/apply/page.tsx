import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';
import { firstParam, type SearchParams } from '@/lib/search-params';

import { ApplicationForm } from '../_components/application-form';
import { BorrowNav } from '../_components/borrow-nav';

export const metadata: Metadata = {
  title: 'Apply to borrow',
  description: 'Apply for a loan. We tell you where the application has got to as it moves.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The loan application. */
export default async function ApplyPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await guardScreen(laneRoutes.borrow.apply);
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Apply to borrow"
        description="One page, and then we keep you posted. Nothing is agreed until you accept an offer."
      >
        <BorrowNav />
      </PageHeader>
      <ApplicationForm initialProduct={firstParam(params, 'product') ?? ''} />
    </div>
  );
}
