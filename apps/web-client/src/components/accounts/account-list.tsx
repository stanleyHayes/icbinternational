'use client';

/**
 * Everything the customer holds with us.
 *
 * Open accounts come first as tiles; closed ones are folded away rather than removed, because a
 * closed account still has six years of statements attached to it and "where did my old account
 * go" is a support call the bank does not need to take.
 *
 * The grid reserves the tiles' space before the data lands, so the "Open an account" button under
 * it does not slide down the page as the balances arrive.
 */

import type { Account } from '@reliance/contracts';
import { Button, Skeleton, TEXT_STYLE, cn } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { describeError } from '@/lib/errors';

import { AccountTile } from './account-tile';
import { isOpen } from './labels';
import { openAccountRoute } from './routes';
import { useAccounts } from './use-accounts';

/** Tiles sketched while the list loads. Most customers hold two or three. */
const PLACEHOLDER_TILES = 3;

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

function TilePlaceholders() {
  return (
    <div className={GRID}>
      {Array.from({ length: PLACEHOLDER_TILES }, (_unused, index) => `tile-${index}`).map((key) => (
        <div key={key} className="border-border bg-surface h-[152px] rounded-lg border p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
          <Skeleton className="mt-6 h-8 w-40" />
        </div>
      ))}
    </div>
  );
}

function ClosedAccounts({ accounts }: { readonly accounts: readonly Account[] }) {
  if (accounts.length === 0) return null;

  return (
    <details className="border-border bg-surface rounded-lg border">
      <summary className="text-fg focus-visible:ring-focus cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset">
        {`Closed accounts (${accounts.length}) — statements are still available`}
      </summary>
      <div className={cn(GRID, 'border-border border-t p-4')}>
        {accounts.map((account) => (
          <AccountTile key={account.id} account={account} />
        ))}
      </div>
    </details>
  );
}

/** Props for {@link AccountList}. */
export interface AccountListProps {
  /** Highlights the account the rest of the screen is scoped to. */
  readonly selectedId?: string | null;
}

function LoadFailure({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const described = describeError(error);

  return (
    <EmptyPanel
      title={described.title}
      description={described.message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

function NothingHeld() {
  return (
    <EmptyPanel
      title="You do not hold an account with us yet"
      description="Open a current account in about three minutes and we will give you the sort code and account number straight away."
      action={<LinkButton href={openAccountRoute}>Open an account</LinkButton>}
    />
  );
}

/**
 * @example <AccountList selectedId={accountId} />
 */
export function AccountList({ selectedId }: AccountListProps) {
  const accounts = useAccounts();
  const retry = (): void => {
    accounts.refetch();
  };

  if (accounts.isPending) return <TilePlaceholders />;
  if (accounts.isError) return <LoadFailure error={accounts.error} onRetry={retry} />;

  const open = accounts.data.filter((account) => isOpen(account.status));
  const closed = accounts.data.filter((account) => !isOpen(account.status));

  if (open.length === 0 && closed.length === 0) return <NothingHeld />;

  return (
    <div className="flex flex-col gap-6">
      <div className={GRID}>
        {open.map((account) => (
          <AccountTile key={account.id} account={account} selected={selectedId === account.id} />
        ))}
      </div>
      <p className={cn(TEXT_STYLE.caption)}>
        Balances shown are what you can spend now. Money on hold is not included.
      </p>
      <ClosedAccounts accounts={closed} />
    </div>
  );
}
