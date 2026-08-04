/**
 * The disputes and chargebacks console.
 *
 * The three tiles are the three ways a disputes team fails. Cases past the regulatory
 * deadline are the compliance failure; cases with no evidence attached are the ones that
 * will be lost at representment; provisional credit outstanding is the bank's exposure if
 * the merchant wins. None of the three is visible from a list of rows.
 */

'use client';

import { useState } from 'react';

import { DisputeStatus, type Dispute } from '@reliance/contracts';

import {
  ConsoleScreen,
  countBreached,
  MetricRow,
  MetricTile,
  QueueError,
  QueueLoading,
  ScreenPanel,
  useConsoleNow,
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type FilterSpec } from '@/components/shell/ops';
import { formatCount, humaniseCode, shortenId } from '@/lib/format';

import { disputeColumns } from './dispute-columns';
import { DisputeOutcome } from './dispute-outcome';
import { DisputeTimeline } from './dispute-timeline';
import { EvidenceViewer } from './evidence-viewer';
import { useDisputes } from './use-disputes';

const DESCRIPTION =
  'Card and payment disputes raised by customers. Each has a regulatory deadline, evidence on ' +
  'both sides, and an outcome that posts real entries to the ledger.';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'State',
    kind: 'select',
    options: Object.values(DisputeStatus).map((status) => ({
      value: status,
      label: humaniseCode(status),
    })),
  },
];

/** States in which the bank is still on the hook. */
const LIVE = new Set<string>([
  DisputeStatus.SUBMITTED,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.EVIDENCE_REQUESTED,
  DisputeStatus.REPRESENTED,
  DisputeStatus.ARBITRATION,
]);

interface DisputeTilesProps {
  readonly disputes: readonly Dispute[];
  readonly nowMs: number;
}

function DisputeTiles({ disputes, nowMs }: DisputeTilesProps) {
  const live = disputes.filter((dispute) => LIVE.has(dispute.status));
  const breached = countBreached(
    live.map((dispute) => dispute.decisionDueAt),
    nowMs,
  );
  const noEvidence = live.filter((dispute) => dispute.evidenceIds.length === 0).length;
  const credited = live.filter((dispute) => dispute.provisionalCredit !== null).length;

  return (
    <MetricRow>
      <MetricTile label="Live disputes" value={formatCount(live.length)} />
      <MetricTile
        label="Past the deadline"
        value={formatCount(breached)}
        detail={breached === 0 ? 'Every live case is in time' : 'Decide these today'}
        urgent={breached > 0}
      />
      <MetricTile
        label="No evidence attached"
        value={formatCount(noEvidence)}
        detail="These will fail at representment"
        urgent={noEvidence > 0}
      />
      <MetricTile
        label="Provisional credit outstanding"
        value={formatCount(credited)}
        detail="The bank's exposure if the merchant wins"
      />
    </MetricRow>
  );
}

function Workspace({ dispute }: Readonly<{ dispute: Dispute }>) {
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <ScreenPanel title="Evidence">
        <EvidenceViewer
          fileIds={dispute.evidenceIds}
          customerLabel={`the dispute on posting ${shortenId(dispute.transactionId)}`}
        />
      </ScreenPanel>

      <div className="flex flex-col gap-4">
        <ScreenPanel title="Case history">
          <DisputeTimeline dispute={dispute} />
        </ScreenPanel>
        <ScreenPanel title="Outcome">
          <DisputeOutcome dispute={dispute} />
        </ScreenPanel>
      </div>
    </div>
  );
}

/** The disputes screen. */
export function DisputesConsole() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const nowMs = useConsoleNow();

  const queue = useDisputes(filters);
  const rows = queue.data?.data ?? [];
  const selected = rows.find((dispute) => dispute.id === openId) ?? null;

  return (
    <ConsoleScreen title="Disputes" description={DESCRIPTION}>
      <DisputeTiles disputes={rows} nowMs={nowMs} />

      <ScreenPanel title="Queue" flush>
        {queue.isPending && <QueueLoading label="disputes" />}
        {queue.isError && (
          <QueueError error={queue.error} subject="the dispute queue" onRetry={queue.refetch} />
        )}
        {queue.data && (
          <DataTable
            tableId="disputes"
            caption="Customer disputes awaiting a decision"
            rowNoun="disputes"
            columns={disputeColumns(nowMs, openId, setOpenId)}
            rows={rows}
            rowKey={(dispute) => dispute.id}
            totalCount={queue.data.page.total}
            exportName="disputes"
            defaultSort={{ columnId: 'due', direction: 'asc' }}
            filterValues={filters}
            onFilterValuesChange={setFilters}
            filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
          />
        )}
      </ScreenPanel>

      {selected && <Workspace dispute={selected} />}
    </ConsoleScreen>
  );
}
