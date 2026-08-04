'use client';

/**
 * What the customer holds, currency by currency.
 *
 * Only the accounts that actually hold a foreign currency. Listing every account here would
 * duplicate the Accounts screen and bury the thing this page is for, which is seeing at a glance
 * whether there are enough euros for a trip.
 */

import { AccountType, type Account } from '@reliance/contracts';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, MoneyCell, QueryPanel, Section, useAccounts } from '@/components/transfers';

const CONVERT = <LinkButton href={laneRoutes.wallets.convert}>Convert money</LinkButton>;

const NO_WALLETS = (
  <EmptyPanel
    title="No currency wallets yet"
    description="A currency wallet holds money in euros, dollars or any currency we support, so you can convert when the rate suits you rather than when you spend."
  />
);

/** True when the account is one of the customer's currency wallets. */
function isWallet(account: Account): boolean {
  return account.type === AccountType.FX_WALLET;
}

function WalletRow({ account }: { readonly account: Account }) {
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="min-w-0">
        <span className="text-fg block text-sm font-medium">
          {account.nickname ?? account.productName}
        </span>
        <span className="text-fg-muted mt-0.5 block text-xs">{account.currency}</span>
      </span>
      <MoneyCell money={account.balance.available} srLabel="Available balance" />
    </li>
  );
}

/**
 * @example <WalletBalances />
 */
export function WalletBalances() {
  const accounts = useAccounts();

  return (
    <Section
      title="Your currency wallets"
      description="Money held in each currency, ready to spend or convert."
      action={CONVERT}
    >
      <QueryPanel
        query={accounts}
        skeletonRows={2}
        isEmpty={(list) => list.filter(isWallet).length === 0}
        empty={NO_WALLETS}
      >
        {(list) => (
          <ul className="flex flex-col">
            {list.filter(isWallet).map((account) => (
              <WalletRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
