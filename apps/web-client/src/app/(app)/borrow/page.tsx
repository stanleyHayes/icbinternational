import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { ApplicationsPanel } from './_components/applications-panel';
import { BorrowNav } from './_components/borrow-nav';
import { LoansPanel } from './_components/loans-panel';
import { ProductsPanel } from './_components/products-panel';

export const metadata: Metadata = {
  title: 'Borrow',
  description: 'Loans and overdrafts: what you owe, what you could borrow, and what it would cost.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** What the customer is borrowing, and what they could. */
export default async function BorrowPage() {
  await guardScreen(laneRoutes.borrow.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Borrow"
        description="What you are paying now, what you could borrow, and exactly what it would cost you."
      >
        <BorrowNav />
      </PageHeader>
      <LoansPanel />
      <ApplicationsPanel />
      <ProductsPanel />
    </div>
  );
}
