import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PayeeDetail } from '../_components/payee-detail';

export const metadata: Metadata = {
  title: 'Payee',
  description:
    'The account details you have saved for this payee, and what their bank said about the name.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** One saved payee. */
export default async function PayeeDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  await guardScreen(laneRoutes.payees.detail(id));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Payee" description="What we hold for them, and how to pay them." />
      <PayeeDetail payeeId={id} />
    </div>
  );
}
