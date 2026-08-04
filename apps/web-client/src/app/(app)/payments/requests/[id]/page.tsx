import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { RequestDetail } from '../../_components/request-detail';

export const metadata: Metadata = {
  title: 'Payment request',
  description: 'The link and code to send on, and whether it has been paid.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One payment request. */
export default async function RequestPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.payments.request(id));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Payment request" description="Send this on to whoever owes you." />
      <RequestDetail requestId={id} />
    </div>
  );
}
