import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';
import { firstParam, type SearchParams } from '@/lib/search-params';

import { TransfersScreen } from './_components/transfers-screen';

export const metadata: Metadata = {
  title: 'Send money',
  description:
    'Move money between your accounts, pay someone at Reliance Bank, send to another UK bank or make an international payment.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Query parameter naming a saved payee to start from. */
const PAYEE_PARAM = 'payee';

/**
 * Send money.
 *
 * One flow for all four rails. `?payee=` starts it filled in, which is what "pay them again"
 * links to from a payee, a receipt or the command palette.
 */
export default async function TransfersPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await guardScreen(laneRoutes.transfers.index);
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Send money"
        description="Between your own accounts, to someone at Reliance Bank, to another UK bank, or abroad."
      />
      <TransfersScreen payeeId={firstParam(params, PAYEE_PARAM)} />
    </div>
  );
}
