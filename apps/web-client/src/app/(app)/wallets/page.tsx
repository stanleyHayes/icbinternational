import type { Metadata } from 'next';

import { LinkButton, PageHeader } from '@/components/shell';
import { laneRoutes } from '@/components/transfers';
import { guardScreen } from '@/components/transfers/kit/screen-guard';

import { RateAlerts } from './_components/rate-alerts';
import { RateBoard } from './_components/rate-board';
import { WalletBalances } from './_components/wallet-balances';

export const metadata: Metadata = {
  title: 'Currency wallets',
  description: 'Hold money in several currencies, convert at a rate held for you, and set alerts.',
};

/** Reads the session cookie, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/** Currency wallets, the rate board and rate alerts. */
export default async function WalletsPage() {
  await guardScreen(laneRoutes.wallets.index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Currency wallets"
        description="Hold money in several currencies and convert when the rate suits you, not when you spend."
        actions={<LinkButton href={laneRoutes.wallets.convert}>Convert money</LinkButton>}
      />
      <WalletBalances />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <RateBoard />
        <RateAlerts />
      </div>
    </div>
  );
}
