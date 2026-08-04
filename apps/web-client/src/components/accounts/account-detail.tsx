'use client';

/**
 * One account, in full.
 *
 * Balance first, then the account's activity, then the details somebody would need to pay into
 * it. That order is the order the screen is used in: most visits are "what is my balance and what
 * has come out", and the sort code is looked up once a year.
 *
 * The activity list here is the same component, reading the same endpoint with the same filter
 * object, as the Activity screen. "See all activity" carries that filter into the URL, so the
 * bigger list opens on exactly these rows rather than on everything.
 */

import { ArrowRightLeft, FileText, XCircle } from 'lucide-react';

import type { Account } from '@reliance/contracts';
import { Card, CardHeader } from '@reliance/ui';

import { LinkButton } from '@/components/shell';
import { forAccount } from '@/components/transactions/filters';
import { transactionsRoute } from '@/components/transactions/routes';
import { TransactionFeed } from '@/components/transactions/transaction-feed';
import { appRoutes } from '@/lib/routes';

import { AccountIdentity } from './account-identity';
import { BalancePanel } from './balance-panel';
import { isOperable, isOpen } from './labels';
import { NicknameForm } from './nickname-form';
import { closeAccountRoute, statementsRoute } from './routes';

/** The buttons on the balance card: the two things a customer does most from an account. */
function QuickActions({ account }: { readonly account: Account }) {
  if (!isOperable(account.status)) return null;

  return (
    <>
      <LinkButton
        href={appRoutes.transfers}
        startIcon={<ArrowRightLeft aria-hidden="true" className="size-4" />}
      >
        Send money
      </LinkButton>
      <LinkButton
        href={statementsRoute(account.id)}
        variant="secondary"
        startIcon={<FileText aria-hidden="true" className="size-4" />}
      >
        Statements
      </LinkButton>
    </>
  );
}

function ManagePanel({ account }: { readonly account: Account }) {
  if (!isOpen(account.status)) return null;

  return (
    <Card>
      <CardHeader
        title="Managing this account"
        description="Closing an account stops its standing orders and Direct Debits. Statements stay available for six years."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <LinkButton href={statementsRoute(account.id)} variant="secondary">
          Statement archive
        </LinkButton>
        <LinkButton
          href={closeAccountRoute(account.id)}
          variant="ghost"
          startIcon={<XCircle aria-hidden="true" className="size-4" />}
        >
          Close this account
        </LinkButton>
      </div>
    </Card>
  );
}

/** Props for {@link AccountDetail}. */
export interface AccountDetailProps {
  readonly account: Account;
}

/**
 * @example <AccountDetail account={account} />
 */
export function AccountDetail({ account }: AccountDetailProps) {
  const filters = forAccount(account.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <BalancePanel account={account} actions={<QuickActions account={account} />} />

        <section aria-labelledby="account-activity" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="account-activity" className="font-display text-fg text-xl font-semibold">
              Recent activity
            </h2>
            <LinkButton href={transactionsRoute(filters)} variant="ghost">
              See all activity
            </LinkButton>
          </div>
          <TransactionFeed filters={filters} withBalance />
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <AccountIdentity account={account} />
        <NicknameForm account={account} />
        <ManagePanel account={account} />
      </div>
    </div>
  );
}
