import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { OrderDetail } from '../_components/order-detail';

export const metadata: Metadata = {
  title: 'Standing order',
  description: 'What this standing order pays, when it next runs, and how to change or stop it.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One standing order. */
export default async function OrderDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.scheduled.detail(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Standing order" description="What it pays, and when it next runs." />
      <OrderDetail orderId={id} />
    </div>
  );
}
