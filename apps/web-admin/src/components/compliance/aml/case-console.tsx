/**
 * The investigations screen.
 *
 * Cases are listed by how long they have been open rather than by severity, because the
 * risk in an investigation queue is age. A high-severity case opened this morning is
 * being worked; a medium one opened in March is a case nobody owns, and it is the second
 * that turns into a regulatory finding.
 */

'use client';

import { useState } from 'react';

import type { AmlCase } from '@reliance/contracts';

import {
  ConsoleScreen,
  MetricRow,
  MetricTile,
  QueueError,
  QueueLoading,
  ScreenPanel,
  useConsoleNow,
} from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatCount } from '@/lib/format';

import { useAmlAlerts, useAmlCases } from '../data/use-aml';

import { caseColumns } from './case-columns';
import { CaseWorkspace } from './case-workspace';

const DESCRIPTION =
  'Investigations into customer behaviour that transaction monitoring flagged. Each one ends ' +
  'with a written disposition, and where the conclusion is that the activity is suspicious it ' +
  'ends with a report.';

/** Cases that no longer need working. */
const FINISHED = new Set<string>(['CLOSED', 'REPORTED']);

interface CaseTilesProps {
  readonly active: number;
  readonly unassigned: number;
  readonly reported: number;
  readonly total: number;
}

function CaseTiles(props: CaseTilesProps) {
  return (
    <MetricRow>
      <MetricTile label="Open investigations" value={formatCount(props.active)} />
      <MetricTile
        label="Nobody assigned"
        value={formatCount(props.unassigned)}
        detail={props.unassigned === 0 ? 'Every case has an owner' : 'These have no owner'}
        urgent={props.unassigned > 0}
      />
      <MetricTile label="Reports filed" value={formatCount(props.reported)} />
      <MetricTile label="All cases" value={formatCount(props.total)} />
    </MetricRow>
  );
}

interface CaseListProps {
  readonly cases: ReturnType<typeof useAmlCases>;
  readonly columns: readonly DataColumn<AmlCase>[];
  readonly rows: readonly AmlCase[];
}

function CaseList({ cases, columns, rows }: CaseListProps) {
  if (cases.isPending) return <QueueLoading label="investigations" />;
  if (cases.isError) {
    return (
      <QueueError error={cases.error} subject="the investigations list" onRetry={cases.refetch} />
    );
  }

  return (
    <DataTable
      tableId="aml-cases"
      caption="Money-laundering investigations"
      rowNoun="investigations"
      columns={columns}
      rows={rows}
      rowKey={(record) => record.id}
      totalCount={cases.data?.page.total}
      exportName="investigations"
      defaultSort={{ columnId: 'age', direction: 'asc' }}
    />
  );
}

/** The investigations screen. */
export function CaseConsole() {
  const [openId, setOpenId] = useState<string | null>(null);
  const nowMs = useConsoleNow();

  const cases = useAmlCases();
  const alerts = useAmlAlerts({});

  const rows = cases.data?.data ?? [];
  const active = rows.filter((record) => !FINISHED.has(record.status));
  const reported = rows.filter((record) => record.suspiciousActivityReportFiled);
  const unassigned = active.filter((record) => record.assignedToId === null);
  const selected = rows.find((record) => record.id === openId) ?? null;

  return (
    <ConsoleScreen title="Investigations" description={DESCRIPTION}>
      <CaseTiles
        active={active.length}
        unassigned={unassigned.length}
        reported={reported.length}
        total={rows.length}
      />

      <ScreenPanel title="Cases" flush>
        <CaseList cases={cases} columns={caseColumns(nowMs, openId, setOpenId)} rows={rows} />
      </ScreenPanel>

      <ScreenPanel title="Workspace">
        <CaseWorkspace investigation={selected} alerts={alerts.data?.data ?? []} />
      </ScreenPanel>
    </ConsoleScreen>
  );
}
