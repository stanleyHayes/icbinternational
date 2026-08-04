'use client';

/**
 * The customer's accounts, across the top of the home screen.
 *
 * Open accounts only. A closed account belongs in the accounts list, where its statements are;
 * on a home screen it is a tile that answers no question and takes up a column.
 *
 * The grid reserves its rows before the balances arrive, so the panels underneath do not slide.
 */

import { Skeleton } from '@reliance/ui';

import { AccountTile } from '@/components/accounts/account-tile';
import { isOpen } from '@/components/accounts/labels';
import { openAccountRoute } from '@/components/accounts/routes';
import { useAccounts } from '@/components/accounts/use-accounts';
import { EmptyPanel, LinkButton } from '@/components/shell';
import { useSelectedAccount } from '@/lib/selected-account';

/** Tiles sketched while the balances load. */
const PLACEHOLDERS = 3;

const TILE_HEIGHT = 152;

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

/** Every open account, as tiles. */
export function AccountsStrip() {
  const accounts = useAccounts();
  const { accountId } = useSelectedAccount();

  if (accounts.isPending) {
    return (
      <div className={GRID}>
        {Array.from({ length: PLACEHOLDERS }, (_unused, index) => `tile-${index}`).map((key) => (
          <Skeleton
            key={key}
            shape="block"
            className="w-full"
            style={{ height: `${TILE_HEIGHT}px` }}
          />
        ))}
      </div>
    );
  }

  if (accounts.isError) return null;

  const open = accounts.data.filter((account) => isOpen(account.status));

  if (open.length === 0) {
    return (
      <EmptyPanel
        title="You do not hold an account with us yet"
        description="Open a current account in about three minutes and we will give you the sort code and account number straight away."
        action={<LinkButton href={openAccountRoute}>Open an account</LinkButton>}
      />
    );
  }

  return (
    <div className={GRID} style={{ minHeight: `${TILE_HEIGHT}px` }}>
      {open.map((account) => (
        <AccountTile key={account.id} account={account} selected={accountId === account.id} />
      ))}
    </div>
  );
}
