import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { TransferDetail } from '../_components/transfer-detail';

export const metadata: Metadata = {
  title: 'Payment',
  description: 'Track a payment, see its receipt and follow every step it has been through.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One payment, with its receipt and its timeline. */
export default async function TransferDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.transfers.detail(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your payment"
        description="Where it is, what it cost, and the receipt you can share."
      />
      <TransferDetail transferId={id} />
    </div>
  );
}
