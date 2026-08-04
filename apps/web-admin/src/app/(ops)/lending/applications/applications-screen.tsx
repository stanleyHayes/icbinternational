/**
 * The underwriting queue.
 *
 * Defaults to the applications actually waiting on a decision rather than to everything,
 * because a queue that opens on three months of history is a queue nobody works from the
 * top of.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { LoanApplicationStatus, type LoanApplication } from '@reliance/contracts';

import { KpiTile, OpsScreen, RegisterPanel, opsKeys, useNowMs } from '@/components/ops';
import { FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, humaniseCode } from '@/lib/format';

import { applicationColumns } from './application-columns';
import { UnderwritingDrawer } from './underwriting-drawer';

/** Applications read per page. */
const PAGE_SIZE = 100;

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'select',
    options: Object.values(LoanApplicationStatus).map((value) => ({
      value,
      label: humaniseCode(value),
    })),
  },
];

/** Statuses that still need somebody to act. */
const OPEN: ReadonlySet<LoanApplicationStatus> = new Set([
  LoanApplicationStatus.SUBMITTED,
  LoanApplicationStatus.UNDER_REVIEW,
  LoanApplicationStatus.REFERRED,
]);

function Figures({ rows }: Readonly<{ rows: readonly LoanApplication[] }>) {
  const open = rows.filter((row) => OPEN.has(row.status)).length;
  const referred = rows.filter((row) => row.status === LoanApplicationStatus.REFERRED).length;
  const offered = rows.filter((row) => row.status === LoanApplicationStatus.OFFER_MADE).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Waiting on an underwriter"
        tone={open > 0 ? 'pending' : 'success'}
        value={formatCount(open)}
        hint="Submitted, in review, or referred for a second opinion."
      />
      <KpiTile
        label="Referred"
        value={formatCount(referred)}
        hint="A first underwriter has asked for a second opinion."
      />
      <KpiTile
        label="Offers with the applicant"
        value={formatCount(offered)}
        hint="Decided, and now waiting on the customer to accept."
      />
    </div>
  );
}

/** The queue, with the underwriting workstation behind it. */
/**
 * The underwriting queue, narrowed to one status.
 *
 * The status is part of the query key, so switching the filter fetches rather than
 * filtering a page that may not contain every application in the chosen state.
 */
function useApplications(status: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: opsKeys.loanApplications(status),
    queryFn: async ({ signal }) =>
      client.admin.loanApplications(
        { limit: PAGE_SIZE, ...(status ? { status: status as LoanApplicationStatus } : {}) },
        { signal },
      ),
  });
}

export function ApplicationsScreen() {
  const nowMs = useNowMs();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({
    status: LoanApplicationStatus.UNDER_REVIEW,
  });
  const [opened, setOpened] = useState<LoanApplication | null>(null);

  const query = useApplications(filters.status ?? '');
  const rows = query.data?.data ?? [];

  return (
    <OpsScreen
      title="Lending applications"
      description="Underwrite new lending: assess affordability, build an offer, and record the decision."
    >
      <Figures rows={rows} />

      <RegisterPanel
        title="Underwriting queue"
        description="Longest waiting first."
        query={query}
        subject="the underwriting queue"
        tableId="ops-loan-applications"
        caption="Lending applications awaiting a decision"
        rowNoun="applications"
        columns={applicationColumns({ nowMs, onOpen: setOpened })}
        rows={rows}
        rowKey={(row) => row.id}
        totalCount={query.data?.page.total}
        defaultSort={{ columnId: 'submittedAt', direction: 'asc' }}
        filterValues={filters}
        onFilterValuesChange={setFilters}
        exportName="lending-applications"
        filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
      />

      <UnderwritingDrawer application={opened} onClose={() => setOpened(null)} />
    </OpsScreen>
  );
}
