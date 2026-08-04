import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';
import { firstParam, type SearchParams } from '@/lib/search-params';

import { DisputeForm } from '../../_components/dispute-form';

export const metadata: Metadata = {
  title: 'Dispute a payment',
  description: 'Tell us what went wrong with a payment and we will investigate it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Raising a dispute. */
export default async function NewDisputePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await guardScreen(laneRoutes.support.newDispute);
  const params = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Dispute a payment"
        description="We may credit you while we look into it. If we do, it is provisional until the case ends."
      />
      <DisputeForm initialTransactionId={firstParam(params, 'transaction') ?? ''} />
    </div>
  );
}
