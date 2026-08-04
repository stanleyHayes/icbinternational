import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { PaymentsNav } from '../_components/payments-nav';
import { QrPanel } from '../_components/qr-panel';

export const metadata: Metadata = {
  title: 'Payment codes',
  description: 'Open a Reliance payment code somebody has sent you, or share one of your own.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Opening and sharing payment codes. */
export default async function QrPage() {
  await guardScreen(laneRoutes.payments.qr);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Payment codes"
        description="Open a code somebody sent you. To share one of your own, create a request and send its code."
      >
        <PaymentsNav />
      </PageHeader>
      <QrPanel />
    </div>
  );
}
