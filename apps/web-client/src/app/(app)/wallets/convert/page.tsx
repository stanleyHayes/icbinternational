import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { ConvertForm } from '../_components/convert-form';
import { RateBoard } from '../_components/rate-board';

export const metadata: Metadata = {
  title: 'Convert money',
  description:
    'Convert between your currencies at a rate held for you, with the margin shown as money.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Converting between the customer's own currencies. */
export default async function ConvertPage() {
  await guardScreen(laneRoutes.wallets.convert);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Convert money"
        description="We hold the rate while you decide, and show our margin as money rather than hiding it in the rate."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <ConvertForm />
        <RateBoard />
      </div>
    </div>
  );
}
