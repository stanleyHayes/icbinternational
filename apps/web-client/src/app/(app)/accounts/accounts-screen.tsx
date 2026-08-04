'use client';

/**
 * The accounts list, scoped to whatever the shell's switcher has selected.
 *
 * Selecting an account in the top bar highlights it here rather than filtering the list away:
 * the whole point of this screen is to see everything at once, and hiding three accounts because
 * one is "selected" would be the opposite of what the customer came for.
 */

import { AccountList } from '@/components/accounts/account-list';
import { useSelectedAccount } from '@/lib/selected-account';

/** Every account, with the selected one marked. */
export function AccountsScreen() {
  const { accountId } = useSelectedAccount();
  return <AccountList selectedId={accountId} />;
}
