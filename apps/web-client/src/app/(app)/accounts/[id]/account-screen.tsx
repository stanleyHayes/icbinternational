'use client';

/**
 * Loads one account and renders its detail.
 *
 * A client component rather than a call from the page, because `AccountBoundary` takes a render
 * function and a function cannot cross the server-to-client boundary — React has no way to
 * serialise it. The page stays a server component that guards the session; everything that needs
 * a callback lives on this side of the line.
 */

import { AccountBoundary } from '@/components/accounts/account-boundary';
import { AccountDetail } from '@/components/accounts/account-detail';

/** Props for {@link AccountScreen}. */
export interface AccountScreenProps {
  readonly accountId: string;
}

/** One account: balance, activity and the details someone needs to pay into it. */
export function AccountScreen({ accountId }: AccountScreenProps) {
  return (
    <AccountBoundary accountId={accountId} rows={5}>
      {(account) => <AccountDetail account={account} />}
    </AccountBoundary>
  );
}
