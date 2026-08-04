import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PayBillForm } from '../../_components/pay-bill-form';

export const metadata: Metadata = {
  title: 'Pay a bill',
  description: 'Pay this company, with your reference checked against their own format first.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Paying one biller. */
export default async function BillerPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.payments.biller(id));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Pay a bill" description="Check the reference against your bill." />
      <PayBillForm billerId={id} />
    </div>
  );
}
