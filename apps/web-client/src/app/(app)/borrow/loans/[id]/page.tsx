import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { LoanDetail } from '../../_components/loan-detail';

export const metadata: Metadata = {
  title: 'Loan',
  description: 'What is left to pay, the full schedule, and how to pay more or settle it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One loan. */
export default async function LoanPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.borrow.loan(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your loan" description="What is left, and the ways to pay it." />
      <LoanDetail loanId={id} />
    </div>
  );
}
