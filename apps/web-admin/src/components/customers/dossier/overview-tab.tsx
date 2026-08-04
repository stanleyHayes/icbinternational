/**
 * The thirty seconds before an agent picks up the call.
 *
 * Four figures and a list of anything unusual. The figures are totals per currency rather
 * than one converted number, because converting to show a single total would invent a rate
 * and put a figure on screen that is not in any account. A customer holding sterling and
 * euros has two positions, and the console says so.
 */

'use client';

import type { Account } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';
import { EmptyState, MoneyText } from '@reliance/ui';

import {
  MetricRow,
  MetricTile,
  QueueError,
  QueueLoading,
  ScreenPanel,
} from '@/components/compliance/kit';
import { formatCount, humaniseCode } from '@/lib/format';

import { useCustomerRisk, type CustomerRisk } from '../data/use-customer-risk';
import { useCustomerAccounts } from '../data/use-dossier';

/** A position in one currency, summed from the accounts denominated in it. */
interface Position {
  readonly currency: CurrencyCode;
  readonly available: string;
  readonly held: string;
}

/** Sums balances per currency. Money never crosses a currency boundary without a rate. */
function positions(accounts: readonly Account[]): readonly Position[] {
  const totals = new Map<CurrencyCode, { available: Money; held: Money }>();

  for (const account of accounts) {
    const running = totals.get(account.currency) ?? {
      available: Money.zero(account.currency),
      held: Money.zero(account.currency),
    };
    const { available, held } = account.balance;
    totals.set(account.currency, {
      available: running.available.plus(Money.fromMinor(available.amount, account.currency)),
      held: running.held.plus(Money.fromMinor(held.amount, account.currency)),
    });
  }

  return [...totals.entries()].map(([currency, total]) => ({
    currency,
    available: total.available.amount.toString(),
    held: total.held.amount.toString(),
  }));
}

function PositionList({ accounts }: Readonly<{ accounts: readonly Account[] }>) {
  const rows = positions(accounts);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing held"
        description="This customer has no open account, so there is no balance to show."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((position) => (
        <li
          key={position.currency}
          className="border-border flex items-center justify-between gap-4 border-b pb-2 last:border-0"
        >
          <span className="font-body text-fg text-sm">{position.currency}</span>
          <span className="flex items-center gap-6">
            <span className="flex flex-col items-end">
              <span className="font-body text-fg-subtle text-xs">On hold</span>
              <MoneyText amount={position.held} currency={position.currency} muted />
            </span>
            <span className="flex flex-col items-end">
              <span className="font-body text-fg-subtle text-xs">Available</span>
              <MoneyText
                amount={position.available}
                currency={position.currency}
                srLabel="Available balance"
              />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface OverviewTabProps {
  readonly customerId: string;
}

/** Position, open account count and anything currently flagged. */
export function OverviewTab({ customerId }: OverviewTabProps) {
  const accounts = useCustomerAccounts(customerId);
  const risk = useCustomerRisk(customerId);

  if (accounts.isPending) return <QueueLoading label="the customer's position" />;
  if (accounts.isError) {
    return (
      <QueueError
        error={accounts.error}
        subject="this customer's accounts"
        onRetry={accounts.refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SummaryTiles accounts={accounts.data} risk={risk.data ?? null} />

      <ScreenPanel title="Position by currency">
        <PositionList accounts={accounts.data} />
      </ScreenPanel>
    </div>
  );
}

interface SummaryTilesProps {
  readonly accounts: readonly Account[];
  readonly risk: CustomerRisk | null;
}

function SummaryTiles({ accounts, risk }: SummaryTilesProps) {
  const open = accounts.filter((account) => account.status === 'ACTIVE');
  const openAlerts = risk?.alerts.filter((alert) => alert.status === 'OPEN') ?? [];
  const openHits = risk?.screeningHits.filter((hit) => hit.status === 'OPEN') ?? [];
  const identity = risk?.kycCases.at(0);

  return (
    <MetricRow>
      <MetricTile label="Open accounts" value={formatCount(open.length)} />
      <MetricTile
        label="Monitoring alerts"
        value={formatCount(openAlerts.length)}
        detail={openAlerts.length === 0 ? 'Nothing awaiting triage' : 'Awaiting triage'}
        urgent={openAlerts.length > 0}
      />
      <MetricTile
        label="List matches"
        value={formatCount(openHits.length)}
        detail={openHits.length === 0 ? 'No open match' : 'Awaiting adjudication'}
        urgent={openHits.length > 0}
      />
      <MetricTile
        label="Identity"
        value={identity ? humaniseCode(identity.status) : 'Not started'}
        detail={identity ? `Tier ${identity.currentTier} held` : 'Limited to tier 0'}
      />
    </MetricRow>
  );
}
