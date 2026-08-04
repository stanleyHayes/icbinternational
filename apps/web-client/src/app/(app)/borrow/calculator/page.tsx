import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { BorrowNav } from '../_components/borrow-nav';
import { CalculatorPanel } from '../_components/calculator-panel';

export const metadata: Metadata = {
  title: 'Loan calculator',
  description: 'Work out the monthly payment and the total cost before you apply for anything.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** The repayment calculator. */
export default async function CalculatorPage() {
  await guardScreen(laneRoutes.borrow.calculator);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Loan calculator"
        description="An illustration only. It does not touch your credit file and we do not see it."
      >
        <BorrowNav />
      </PageHeader>
      <CalculatorPanel />
    </div>
  );
}
