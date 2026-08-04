/**
 * The hold register.
 *
 * Every lien, court order and compliance freeze across the book, with the amount each one
 * is keeping out of a customer's hands. Holds are the quietest way a bank makes somebody's
 * money unavailable, which is exactly why they belong on a register an operator can read
 * rather than only in the account they were placed on.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { HoldReason, HoldStatus, Permission } from '@reliance/contracts';
import { Button, MoneyText } from '@reliance/ui';

import { KpiTile, OpsScreen, RegisterPanel, opsKeys, sumAmounts, useNowMs } from '@/components/ops';
import { FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { holdColumns } from './hold-columns';
import { PlaceHoldDialog } from './place-hold-dialog';

/** Holds read per page. */
const PAGE_SIZE = 100;

/** Currency the register totals in. */
const REPORTING_CURRENCY = 'GBP';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'select',
    options: Object.values(HoldStatus).map((value) => ({ value, label: humaniseCode(value) })),
  },
  {
    id: 'reason',
    label: 'Reason',
    kind: 'select',
    options: Object.values(HoldReason).map((value) => ({ value, label: humaniseCode(value) })),
  },
  { id: 'accountId', label: 'Account', kind: 'text', placeholder: 'acc_…' },
];

/**
 * The register, narrowed by the filter bar.
 *
 * Filtered here rather than at the platform because the hold endpoint takes only a cursor
 * and a limit. The screen says how many rows it is filtering over so the operator knows
 * the count is of the page and not of the book.
 */
function useFilteredHolds(filters: Readonly<Record<string, string>>) {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.holds(),
    queryFn: async ({ signal }) => client.admin.holds({ limit: PAGE_SIZE }, { signal }),
  });

  const rows = useMemo(() => {
    const all = query.data?.data ?? [];
    return all.filter(
      (hold) =>
        (!filters.status || hold.status === filters.status) &&
        (!filters.reason || hold.reason === filters.reason) &&
        (!filters.accountId || hold.accountId.includes(filters.accountId.trim())),
    );
  }, [query.data, filters]);

  return { query, rows };
}

interface FiguresProps {
  readonly total: number;
  readonly activeCount: number;
  readonly heldTotal: string;
}

function HoldFigures({ total, activeCount, heldTotal }: FiguresProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Value held"
        tone="pending"
        value={<MoneyText amount={heldTotal} currency={REPORTING_CURRENCY} size="xl" muted />}
        hint="Total of every active hold on this page. Not posted to the ledger."
      />
      <KpiTile
        label="Active holds"
        value={formatCount(activeCount)}
        hint="Reserving value the customer cannot spend."
      />
      <KpiTile
        label="On the register"
        value={formatCount(total)}
        hint="Including holds already captured, released or lapsed."
      />
    </div>
  );
}

/** The hold register, filtered locally against the page the platform returned. */
export function HoldsScreen() {
  const nowMs = useNowMs();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [placing, setPlacing] = useState(false);
  const { query, rows } = useFilteredHolds(filters);

  const active = rows.filter((hold) => hold.status === HoldStatus.ACTIVE);
  const heldTotal = sumAmounts(active.map((hold) => hold.amount));

  return (
    <OpsScreen
      title="Holds"
      description="Liens, court orders and compliance freezes reducing an available balance right now."
      actions={
        <Can permission={Permission.HOLD_MANAGE}>
          <Button onClick={() => setPlacing(true)}>Place a hold</Button>
        </Can>
      }
    >
      <HoldFigures total={rows.length} activeCount={active.length} heldTotal={heldTotal} />

      <RegisterPanel
        title="Hold register"
        description="Newest first."
        query={query}
        subject="the hold register"
        tableId="ops-holds"
        caption="Holds across the bank"
        rowNoun="holds"
        columns={holdColumns(nowMs)}
        rows={rows}
        rowKey={(row) => row.id}
        totalCount={query.data?.page.total}
        defaultSort={{ columnId: 'placedAt', direction: 'desc' }}
        filterValues={filters}
        onFilterValuesChange={setFilters}
        exportName="holds"
        filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
      />

      <PlaceHoldDialog open={placing} onClose={() => setPlacing(false)} />
    </OpsScreen>
  );
}
