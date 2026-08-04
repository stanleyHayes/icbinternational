/**
 * The arrears dashboard and the collections queue.
 *
 * The ageing bands are the dashboard, because they are what the bank reports against and
 * what decides which conversation a collections agent is allowed to have. Underneath them
 * is the queue itself, worst first.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Loan } from '@reliance/contracts';
import { Card, MoneyText } from '@reliance/ui';

import { KpiTile, OpsScreen, Panel, QueryState, opsKeys, sumAmounts } from '@/components/ops';
import { DataTable } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount } from '@/lib/format';

import { summariseAgeing, type BucketSummary } from './ageing';
import { arrearsColumns } from './arrears-columns';
import { CollectionsDrawer } from './collections-drawer';

/** Loans read per page. */
const PAGE_SIZE = 100;

/** Currency the dashboard totals in. */
const REPORTING_CURRENCY = 'GBP';

function BandCard({ band }: Readonly<{ band: BucketSummary }>) {
  return (
    <Card className="flex flex-col gap-1.5">
      <span className="font-body text-fg-subtle text-xs font-medium tracking-wider uppercase">
        {band.label}
      </span>
      <MoneyText amount={band.arrears} currency={REPORTING_CURRENCY} size="xl" muted />
      <span className="font-body text-fg text-sm">
        {formatCount(band.count)} {band.count === 1 ? 'account' : 'accounts'}
      </span>
      <span className="font-body text-fg-muted text-xs">{band.action}</span>
    </Card>
  );
}

function Ageing({ loans }: Readonly<{ loans: readonly Loan[] }>) {
  const bands = summariseAgeing(loans);

  return (
    <Panel
      title="Ageing"
      description="Value at risk in each band, and what the bank does about it."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bands.map((band) => (
          <BandCard key={band.id} band={band} />
        ))}
      </div>
    </Panel>
  );
}

/** The arrears book and the collections queue over it. */
/**
 * What the book is carrying.
 *
 * "Balance at risk" is the whole outstanding balance, not the missed payments — a loan a
 * month behind puts its entire principal at risk, and collections is sized against that.
 */
function ArrearsFigures({ loans }: { readonly loans: readonly Loan[] }) {
  const totalArrears = sumAmounts(loans.map((loan) => loan.arrearsAmount));
  const totalOutstanding = sumAmounts(loans.map((loan) => loan.outstandingBalance));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Total in arrears"
        tone="debit"
        value={<MoneyText amount={totalArrears} currency={REPORTING_CURRENCY} size="xl" muted />}
        hint="Payments missed across every loan on this page."
      />
      <KpiTile
        label="Balance at risk"
        value={
          <MoneyText amount={totalOutstanding} currency={REPORTING_CURRENCY} size="xl" muted />
        }
        hint="Total outstanding on the accounts in arrears, not only the missed payments."
      />
      <KpiTile
        label="Accounts in collections"
        value={formatCount(loans.length)}
        hint="Loans with at least one payment past due."
      />
    </div>
  );
}

export function ArrearsScreen() {
  const client = useApiClient();
  const [opened, setOpened] = useState<Loan | null>(null);

  const query = useQuery({
    queryKey: opsKeys.arrears(),
    queryFn: async ({ signal }) => client.admin.arrears({ limit: PAGE_SIZE }, { signal }),
  });

  const loans = query.data?.data ?? [];

  return (
    <OpsScreen
      title="Arrears and collections"
      description="Every loan behind schedule, what is owed on it, and how long it has been owed."
    >
      <ArrearsFigures loans={loans} />

      <QueryState query={query} subject="the arrears book">
        <div className="flex flex-col gap-4">
          <Ageing loans={loans} />

          <Panel title="Collections queue" description="Worst first." flush>
            <DataTable
              tableId="ops-arrears"
              caption="Loans in arrears"
              rowNoun="loans"
              columns={arrearsColumns(setOpened)}
              rows={loans}
              rowKey={(row) => row.id}
              totalCount={query.data?.page.total}
              defaultSort={{ columnId: 'daysPastDue', direction: 'desc' }}
              exportName="arrears"
            />
          </Panel>
        </div>
      </QueryState>

      <CollectionsDrawer loan={opened} onClose={() => setOpened(null)} />
    </OpsScreen>
  );
}
