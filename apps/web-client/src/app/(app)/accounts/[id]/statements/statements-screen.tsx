'use client';

/**
 * An account's statement archive, with a way back to the account it belongs to.
 *
 * A client component because the back link needs the account's name, which is only known once
 * the record has loaded — and because `AccountBoundary` takes a render function, which cannot be
 * handed across the server-to-client boundary.
 */

import { AccountBoundary } from '@/components/accounts/account-boundary';
import { accountName } from '@/components/accounts/account-tile';
import { accountRoute } from '@/components/accounts/routes';
import { StatementArchive } from '@/components/accounts/statement-archive';
import { LinkButton, PageHeader } from '@/components/shell';

/** Props for {@link StatementsScreen}. */
export interface StatementsScreenProps {
  readonly accountId: string;
}

/** Every statement produced for one account. */
export function StatementsScreen({ accountId }: StatementsScreenProps) {
  return (
    <AccountBoundary accountId={accountId} rows={4}>
      {(account) => (
        <>
          <PageHeader
            title="Statements"
            eyebrow={
              <LinkButton href={accountRoute(accountId)} variant="ghost">
                {`Back to ${accountName(account)}`}
              </LinkButton>
            }
            description="One statement for each month, kept for six years. Each closing balance is the next month's opening balance."
          />
          <StatementArchive accountId={accountId} />
        </>
      )}
    </AccountBoundary>
  );
}
