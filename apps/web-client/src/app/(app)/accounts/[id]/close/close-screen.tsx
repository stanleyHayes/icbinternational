'use client';

/**
 * The closure form, with the customer's other accounts loaded so a residual balance has
 * somewhere to go.
 *
 * The destinations come from the same account list the rest of the app reads, so an account
 * opened two minutes ago is already available as a place to sweep the money to.
 */

import { AccountBoundary } from '@/components/accounts/account-boundary';
import { CloseAccountForm } from '@/components/accounts/close-account-form';
import { useAccounts } from '@/components/accounts/use-accounts';

/** Props for {@link CloseScreen}. */
export interface CloseScreenProps {
  readonly accountId: string;
}

/** Loads the account being closed and the ones it could sweep to. */
export function CloseScreen({ accountId }: CloseScreenProps) {
  const accounts = useAccounts();
  const others = (accounts.data ?? []).filter((account) => account.id !== accountId);

  return (
    <AccountBoundary accountId={accountId} rows={3}>
      {(account) => <CloseAccountForm account={account} others={others} />}
    </AccountBoundary>
  );
}
