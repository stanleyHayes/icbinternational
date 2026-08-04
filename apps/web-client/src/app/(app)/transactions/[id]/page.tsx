import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { transactionRoute } from '@/components/transactions/routes';
import { requireSession } from '@/lib/session';

import { MovementScreen } from './movement-screen';

export const metadata: Metadata = {
  title: 'Payment details',
  description: 'The full record of one payment, with its receipt.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Route parameters. `params` is a promise from Next 15 onwards. */
interface PageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * One movement, in full.
 *
 * The heading is deliberately generic rather than naming the payee: it is rendered on the server
 * before the record has been fetched, and a heading that changed from "Payment" to "Waitrose"
 * after a beat would move everything under it.
 */
export default async function TransactionPage({ params }: PageProps) {
  const { id: transactionId } = await params;
  await requireSession(transactionRoute(transactionId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment details"
        description="Everything recorded against this payment, including the balance it left behind."
      />
      <MovementScreen transactionId={transactionId} />
    </div>
  );
}
