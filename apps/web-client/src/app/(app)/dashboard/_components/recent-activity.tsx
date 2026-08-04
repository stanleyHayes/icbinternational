'use client';

/**
 * The last few movements.
 *
 * Reads the same feed, through the same hook, as the Activity screen — so the six rows here are
 * the first six rows there, and "See all" opens a list that starts exactly where this one ended.
 * Scoped to the account the shell has selected, because that is what the switcher is for.
 */

import type { Transaction } from '@reliance/contracts';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { forAccount, NO_FILTERS } from '@/components/transactions/filters';
import { transactionsRoute } from '@/components/transactions/routes';
import { TransactionLink } from '@/components/transactions/transaction-link';
import { useTransactionFeed } from '@/components/transactions/use-transactions';
import { useSelectedAccount } from '@/lib/selected-account';

import { Panel } from './panel';

/** Rows on the home screen. Enough to recognise the week, few enough to read at a glance. */
const ROWS = 6;

const ROW_HEIGHT = 68;
const BODY_HEIGHT = ROWS * ROW_HEIGHT;

function Rows({ transactions }: { readonly transactions: readonly Transaction[] }) {
  return (
    <ul className="divide-border divide-y">
      {transactions.map((transaction) => (
        <li key={transaction.id}>
          <TransactionLink transaction={transaction} />
        </li>
      ))}
    </ul>
  );
}

/** The most recent movements on the selected account. */
export function RecentActivity() {
  const { accountId } = useSelectedAccount();
  const filters = accountId ? forAccount(accountId) : NO_FILTERS;
  const feed = useTransactionFeed(filters);

  const transactions = (feed.data?.pages[0]?.data ?? []).slice(0, ROWS);

  return (
    <Panel
      title="Recent activity"
      description="The latest payments in and out."
      minBodyHeight={BODY_HEIGHT}
      loading={feed.isPending}
      error={feed.isError ? feed.error : undefined}
      action={
        <LinkButton href={transactionsRoute(filters)} variant="ghost">
          See all
        </LinkButton>
      }
    >
      {transactions.length === 0 ? (
        <EmptyPanel
          bordered={false}
          title="Nothing has moved yet"
          description="As soon as money goes in or out, it will show up here with the balance after it."
        />
      ) : (
        <Rows transactions={transactions} />
      )}
    </Panel>
  );
}
