/**
 * The dual-control queue.
 *
 * Both halves of four-eyes are on this one screen: raising a request, and deciding
 * somebody else's. That is deliberate — an operator who can see the queue they are adding
 * to understands why their own request is still sitting there, and the screen makes the
 * rule visible rather than enforcing it silently at the moment of refusal.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ApprovalStatus, Permission, type ApprovalRequest } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import {
  KpiTile,
  ManualPostingDialog,
  OpsScreen,
  RegisterPanel,
  opsKeys,
  useNowMs,
} from '@/components/ops';
import { FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';
import { useAdminSession } from '@/lib/session';

import { approvalColumns } from './approval-columns';
import { ApprovalDrawer } from './approval-drawer';

/** Requests read per page. */
const PAGE_SIZE = 100;

/** Filter value meaning "every status". */
const ANY_STATUS = '';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'select',
    options: Object.values(ApprovalStatus).map((value) => ({ value, label: humaniseCode(value) })),
  },
];

interface FiguresProps {
  readonly pending: readonly ApprovalRequest[];
  readonly mine: number;
}

function ApprovalFigures({ pending, mine }: FiguresProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Waiting on an approver"
        tone={pending.length > 0 ? 'pending' : 'success'}
        value={formatCount(pending.length)}
        hint="Requests nobody has decided yet."
      />
      <KpiTile
        label="Raised by you"
        value={formatCount(mine)}
        hint="Still open, and waiting on a colleague. You cannot decide your own."
      />
      <KpiTile
        label="Available for you to decide"
        value={formatCount(pending.length - mine)}
        hint="Open requests a colleague raised."
      />
    </div>
  );
}

/** The queue, the figures above it, and the two controls that act on it. */
/** The dual-control queue, narrowed to one status. */
function useApprovals(status: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: opsKeys.approvals(status),
    queryFn: async ({ signal }) =>
      client.admin.approvals(
        { limit: PAGE_SIZE, ...(status ? { status: status as ApprovalStatus } : {}) },
        { signal },
      ),
  });
}

type ApprovalFilters = Readonly<Record<string, string>>;

/** The queue itself, newest first. */
function ApprovalQueue({
  query,
  rows,
  nowMs,
  filters,
  onFiltersChange,
  onOpen,
}: {
  readonly query: ReturnType<typeof useApprovals>;
  readonly rows: readonly ApprovalRequest[];
  readonly nowMs: number;
  readonly filters: ApprovalFilters;
  readonly onFiltersChange: (next: ApprovalFilters) => void;
  readonly onOpen: (request: ApprovalRequest) => void;
}) {
  return (
    <RegisterPanel
      title="Dual-control queue"
      description="Newest first."
      query={query}
      subject="the approval queue"
      tableId="ops-approvals"
      caption="Requests awaiting a second approver"
      rowNoun="requests"
      columns={approvalColumns({ nowMs, onOpen })}
      rows={rows}
      rowKey={(row) => row.id}
      totalCount={query.data?.page.total}
      defaultSort={{ columnId: 'createdAt', direction: 'desc' }}
      filterValues={filters}
      onFilterValuesChange={onFiltersChange}
      exportName="approvals"
      filters={<FilterBar filters={FILTERS} values={filters} onChange={onFiltersChange} />}
    />
  );
}

export function ApprovalsScreen() {
  const nowMs = useNowMs();
  const { operator } = useAdminSession();
  const [filters, setFilters] = useState<ApprovalFilters>({ status: ApprovalStatus.PENDING });
  const [reviewing, setReviewing] = useState<ApprovalRequest | null>(null);
  const [raising, setRaising] = useState(false);

  const query = useApprovals(filters.status ?? ANY_STATUS);
  const rows = query.data?.data ?? [];
  const pending = rows.filter((row) => row.status === ApprovalStatus.PENDING);
  // Requests this operator raised: they cannot approve their own, so the count is a
  // measure of what they are waiting on rather than what they can clear.
  const mine = pending.filter((row) => row.initiatedBy.id === operator?.id).length;

  return (
    <OpsScreen
      title="Approvals"
      description="Manual postings, reversals and overrides. Every one needs a second operator, and never the one who raised it."
      actions={
        <Can permission={Permission.POSTING_INITIATE}>
          <Button onClick={() => setRaising(true)}>Raise a manual posting</Button>
        </Can>
      }
    >
      <ApprovalFigures pending={pending} mine={mine} />

      <ApprovalQueue
        query={query}
        rows={rows}
        nowMs={nowMs}
        filters={filters}
        onFiltersChange={setFilters}
        onOpen={setReviewing}
      />

      <ApprovalDrawer request={reviewing} onClose={() => setReviewing(null)} />
      <ManualPostingDialog open={raising} onClose={() => setRaising(false)} />
    </OpsScreen>
  );
}
