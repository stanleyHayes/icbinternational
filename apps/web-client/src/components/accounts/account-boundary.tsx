'use client';

/**
 * Loads one account and hands it to whatever needs it.
 *
 * The detail screen, the statement archive and the closure journey all need the same record and
 * all need the same three answers to "what if it is not there": a skeleton the same shape as the
 * content, a sentence in the bank's voice, and a way back to the list. Writing that three times
 * guarantees the third one is subtly different, so it is written once.
 */

import type { ReactNode } from 'react';

import type { Account } from '@reliance/contracts';

import { EmptyPanel, LinkButton, RouteLoading } from '@/components/shell';
import { describeError } from '@/lib/errors';

import { accountsRoute } from './routes';
import { useAccount } from './use-accounts';

/** Props for {@link AccountBoundary}. */
export interface AccountBoundaryProps {
  readonly accountId: string;
  /** Rendered once the account is known. */
  readonly children: (account: Account) => ReactNode;
  /** Skeleton rows to reserve while it loads. Match the density of what follows. */
  readonly rows?: number;
}

/**
 * @example
 * <AccountBoundary accountId={accountId}>
 *   {(account) => <AccountDetail account={account} />}
 * </AccountBoundary>
 */
export function AccountBoundary({ accountId, children, rows = 4 }: AccountBoundaryProps) {
  const account = useAccount(accountId);

  if (account.isPending) return <RouteLoading rows={rows} withHeader={false} />;

  if (account.isError) {
    const described = describeError(account.error);
    return (
      <EmptyPanel
        title={described.title}
        description={`${described.message} Nothing about this account has changed.`}
        action={<LinkButton href={accountsRoute}>Back to your accounts</LinkButton>}
      />
    );
  }

  return <>{children(account.data)}</>;
}
