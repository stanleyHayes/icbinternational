/**
 * The identity-review workstation.
 *
 * Queue above, case below, on one screen. An analyst clears thirty of these in a morning
 * and every navigation between a list and a detail page costs them their place, so the
 * queue stays where it is and the case opens underneath it.
 *
 * The tiles at the top are the numbers a team lead asks about at stand-up: how many are
 * waiting, how many have breached the two-day commitment, and how many are sitting with
 * the customer rather than with us. The last one matters because it is the only part of
 * the backlog the team cannot work down themselves.
 */

'use client';

import { useState } from 'react';

import { KycStatus, type KycCase } from '@reliance/contracts';
import { Checkbox } from '@reliance/ui';

import {
  ConsoleScreen,
  countBreached,
  MetricRow,
  MetricTile,
  openColumn,
  QueueError,
  QueueLoading,
  ScreenPanel,
  useConsoleNow,
  useSelection,
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { formatCount, humaniseCode } from '@/lib/format';

import { labelFor, useCustomerNames } from '../data/use-customer-names';
import { useKycQueue } from '../data/use-kyc';

import { KycBulkBar } from './kyc-bulk-bar';
import { decisionDueAt, kycColumns } from './kyc-columns';
import { KycReview } from './kyc-review';

const DESCRIPTION =
  'Applications waiting on a verification decision. We tell customers a submitted application ' +
  'is answered within two working days, and every refusal must carry a reason code and the ' +
  'wording the customer will read.';

const STATUS_OPTIONS = Object.values(KycStatus).map((status) => ({
  value: status,
  label: humaniseCode(status),
}));

const FILTERS: readonly FilterSpec[] = [
  { id: 'status', label: 'State', kind: 'select', options: STATUS_OPTIONS },
];

/** States where the ball is with the customer, not with the bank. */
const WITH_CUSTOMER = new Set<string>([KycStatus.MORE_INFO_REQUIRED, KycStatus.IN_PROGRESS]);

interface QueueColumnOptions {
  readonly base: readonly DataColumn<KycCase>[];
  readonly selection: ReturnType<typeof useSelection>;
  readonly openCaseId: string | null;
  readonly onOpen: (caseId: string) => void;
}

/** Wraps the display columns with the two controls the queue needs: choose, and open. */
function queueColumns(options: QueueColumnOptions): readonly DataColumn<KycCase>[] {
  const { selection, openCaseId, onOpen } = options;

  return [
    {
      id: 'select',
      header: 'Select',
      alwaysVisible: true,
      cell: (record) => (
        <Checkbox
          checked={selection.isSelected(record.id)}
          aria-label={`Select case ${record.id}`}
          onChange={() => selection.toggle(record.id)}
        />
      ),
      csv: (record) => (selection.isSelected(record.id) ? 'selected' : ''),
    },
    ...options.base,
    openColumn<KycCase>({
      header: 'Review',
      idOf: (record) => record.id,
      openId: openCaseId,
      onOpen,
    }),
  ];
}

/** The identity-review screen. */
export function KycWorkstation() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const nowMs = useConsoleNow();
  const close = () => setOpenCaseId(null);

  const queue = useKycQueue(filters);
  const names = useCustomerNames();
  const rows = queue.data?.data ?? [];
  const selection = useSelection(rows.map((record) => record.id));
  const openCase = rows.find((record) => record.id === openCaseId) ?? null;
  const chosen = rows.filter((record) => selection.isSelected(record.id));

  return (
    <ConsoleScreen title="Identity review" description={DESCRIPTION}>
      <QueueTiles rows={rows} nowMs={nowMs} selected={selection.count} />

      <KycBulkBar selected={chosen} onClear={selection.clear} onApplied={close} />

      <ScreenPanel title="Queue" flush>
        <QueuePanel
          queue={queue}
          columns={queueColumns({
            base: kycColumns(names.data, nowMs),
            selection,
            openCaseId,
            onOpen: setOpenCaseId,
          })}
          rows={rows}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </ScreenPanel>

      <ScreenPanel title="Review">
        <KycReview
          caseId={openCase?.id ?? null}
          customerName={openCase ? labelFor(names.data, openCase.userId) : ''}
          onDecided={close}
        />
      </ScreenPanel>
    </ConsoleScreen>
  );
}

interface QueuePanelProps {
  readonly queue: ReturnType<typeof useKycQueue>;
  readonly columns: readonly DataColumn<KycCase>[];
  readonly rows: readonly KycCase[];
  readonly filters: Readonly<Record<string, string>>;
  readonly onFiltersChange: (filters: Readonly<Record<string, string>>) => void;
}

function QueuePanel(props: QueuePanelProps) {
  const { queue, filters, onFiltersChange } = props;

  if (queue.isPending) return <QueueLoading label="identity cases" />;
  if (queue.isError) {
    return (
      <QueueError error={queue.error} subject="the identity-review queue" onRetry={queue.refetch} />
    );
  }

  return (
    <DataTable
      tableId="kyc-queue"
      caption="Identity cases awaiting a decision"
      rowNoun="cases"
      columns={props.columns}
      rows={props.rows}
      rowKey={(record) => record.id}
      totalCount={queue.data?.page.total}
      exportName="identity-review-queue"
      defaultSort={{ columnId: 'sla', direction: 'asc' }}
      filterValues={filters}
      onFilterValuesChange={onFiltersChange}
      filters={<FilterBar filters={FILTERS} values={filters} onChange={onFiltersChange} />}
    />
  );
}

interface QueueTilesProps {
  readonly rows: readonly KycCase[];
  readonly nowMs: number;
  readonly selected: number;
}

function QueueTiles({ rows, nowMs, selected }: QueueTilesProps) {
  const breached = countBreached(rows.map(decisionDueAt), nowMs);
  const withCustomer = rows.filter((record) => WITH_CUSTOMER.has(record.status)).length;

  return (
    <MetricRow>
      <MetricTile label="In the queue" value={formatCount(rows.length)} />
      <MetricTile
        label="Past our commitment"
        value={formatCount(breached)}
        detail={breached === 0 ? 'Every case is within two working days' : 'Work these first'}
        urgent={breached > 0}
      />
      <MetricTile
        label="Waiting on the customer"
        value={formatCount(withCustomer)}
        detail="Cannot be cleared from this side"
      />
      <MetricTile label="Selected" value={formatCount(selected)} />
    </MetricRow>
  );
}
