'use client';

/**
 * Fixed deposits, with the rate board beside them.
 *
 * The rates are shown whether or not the customer has a deposit, because the board is the reason
 * anybody opens this screen. A deposit's maturity date and its value at maturity are on the row —
 * those are the two numbers somebody is checking.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { Deposit } from '@reliance/contracts';
import { cn, MoneyText, StatusPill } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { RateTable } from './rate-table';

const DEFAULT_CURRENCY = 'GBP';

const NEW_DEPOSIT = <LinkButton href={laneRoutes.save.newDeposit}>Open a fixed deposit</LinkButton>;

const NO_DEPOSITS = (
  <EmptyPanel
    title="No fixed deposits"
    description="Lock money away for a set term and earn a fixed rate on it. You can take it back early, and we will tell you exactly what that costs before you do."
    action={NEW_DEPOSIT}
  />
);

/** One deposit, with the two figures a customer checks. */
function DepositRow({ deposit }: { readonly deposit: Deposit }) {
  return (
    <li>
      <Link
        href={laneRoutes.save.deposit(deposit.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block text-sm font-medium">
            <MoneyText
              amount={deposit.principal.amount}
              currency={deposit.principal.currency}
              srLabel="Amount deposited"
            />
          </span>
          <span className="text-fg-muted mt-0.5 block text-xs">
            Matures {formatDate(deposit.maturesOn)} · worth{' '}
            <MoneyText
              amount={deposit.maturityValue.amount}
              currency={deposit.maturityValue.currency}
              size="sm"
              muted
              srLabel="Value at maturity"
            />
          </span>
        </span>
        <StatusPill
          tone={deposit.status === 'ACTIVE' ? 'credit' : 'neutral'}
          label={deposit.status === 'ACTIVE' ? 'Earning interest' : 'Finished'}
        />
      </Link>
    </li>
  );
}

/**
 * @example <DepositsPanel />
 */
/** The customer's own deposits. */
function DepositList() {
  const deposits = useQuery({
    queryKey: movementKeys.save.deposits({}),
    queryFn: async () => (await browserApi().save.listDeposits()).data,
  });

  return (
    <Section
      title="Fixed deposits"
      description="Money locked away for a set term at a fixed rate."
      action={NEW_DEPOSIT}
    >
      <QueryPanel
        query={deposits}
        skeletonRows={2}
        isEmpty={(list) => list.length === 0}
        empty={NO_DEPOSITS}
      >
        {(list) => (
          <ul className="divide-border -mx-3 flex flex-col divide-y">
            {list.map((deposit) => (
              <DepositRow key={deposit.id} deposit={deposit} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}

/** What a new deposit would earn, which is fixed for the whole term once taken. */
function RatesSection() {
  const rates = useQuery({
    queryKey: movementKeys.save.depositRates(DEFAULT_CURRENCY),
    queryFn: async () =>
      (await browserApi().save.depositRates({ currency: DEFAULT_CURRENCY })).data,
  });

  return (
    <Section title="Today's rates" description="The rate is fixed for the whole term.">
      <QueryPanel query={rates} skeletonRows={3}>
        {(list) => <RateTable rates={list} />}
      </QueryPanel>
    </Section>
  );
}

export function DepositsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <DepositList />
      <RatesSection />
    </div>
  );
}
