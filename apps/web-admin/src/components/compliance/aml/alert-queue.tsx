/**
 * The transaction-monitoring queue.
 *
 * The tile that matters is "past the triage deadline". Monitoring alerts have a regulatory
 * clock, and the failure mode is never a single missed alert — it is a queue that grows a
 * little every day until a month's worth is out of time at once. Putting the breach count
 * next to the total makes that visible on the morning it starts.
 */

'use client';

import { useState } from 'react';

import { AlertSeverity, AlertStatus, type AmlAlert } from '@reliance/contracts';

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
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { formatCount, humaniseCode } from '@/lib/format';

import { useAmlAlerts, useAmlCases } from '../data/use-aml';

import { alertColumns } from './alert-columns';
import { AlertTriage } from './alert-triage';

const DESCRIPTION =
  'Alerts raised by the transaction-monitoring rules. Every alert is triaged against an ' +
  'investigation, and what an analyst concluded is written down before the alert is closed.';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'State',
    kind: 'select',
    options: Object.values(AlertStatus).map((status) => ({
      value: status,
      label: humaniseCode(status),
    })),
  },
  {
    id: 'severity',
    label: 'Severity',
    kind: 'select',
    options: Object.values(AlertSeverity).map((severity) => ({
      value: severity,
      label: humaniseCode(severity),
    })),
  },
];

/** Adds the triage control to the display columns. */
function withTriage(
  base: readonly DataColumn<AmlAlert>[],
  openId: string | null,
  onOpen: (alertId: string) => void,
): readonly DataColumn<AmlAlert>[] {
  return [
    ...base,
    openColumn<AmlAlert>({ header: 'Triage', idOf: (alert) => alert.id, openId, onOpen }),
  ];
}

interface QueueProps {
  readonly queue: ReturnType<typeof useAmlAlerts>;
  readonly columns: readonly DataColumn<AmlAlert>[];
  readonly rows: readonly AmlAlert[];
  readonly filters: Readonly<Record<string, string>>;
  readonly onFiltersChange: (filters: Readonly<Record<string, string>>) => void;
}

function Queue({ queue, columns, rows, filters, onFiltersChange }: QueueProps) {
  if (queue.isPending) return <QueueLoading label="monitoring alerts" />;
  if (queue.isError) {
    return (
      <QueueError error={queue.error} subject="the monitoring queue" onRetry={queue.refetch} />
    );
  }

  return (
    <DataTable
      tableId="aml-alerts"
      caption="Transaction-monitoring alerts"
      rowNoun="alerts"
      columns={columns}
      rows={rows}
      rowKey={(alert) => alert.id}
      totalCount={queue.data?.page.total}
      exportName="monitoring-alerts"
      defaultSort={{ columnId: 'sla', direction: 'asc' }}
      filterValues={filters}
      onFilterValuesChange={onFiltersChange}
      filters={<FilterBar filters={FILTERS} values={filters} onChange={onFiltersChange} />}
    />
  );
}

interface AlertTilesProps {
  readonly open: number;
  readonly breached: number;
  readonly critical: number;
  readonly shown: number;
}

function AlertTiles(props: AlertTilesProps) {
  return (
    <MetricRow>
      <MetricTile label="Awaiting triage" value={formatCount(props.open)} />
      <MetricTile
        label="Past the deadline"
        value={formatCount(props.breached)}
        detail={
          props.breached === 0 ? 'Every open alert is in time' : 'These breach our commitment'
        }
        urgent={props.breached > 0}
      />
      <MetricTile
        label="Critical and open"
        value={formatCount(props.critical)}
        urgent={props.critical > 0}
      />
      <MetricTile label="Shown by this filter" value={formatCount(props.shown)} />
    </MetricRow>
  );
}

/** The monitoring alert screen. */
export function AlertQueue() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const nowMs = useConsoleNow();

  const queue = useAmlAlerts(filters);
  const investigations = useAmlCases();

  const rows = queue.data?.data ?? [];
  const open = rows.filter((alert) => alert.status === AlertStatus.OPEN);
  const breached = countBreached(
    open.map((alert) => alert.slaDueAt),
    nowMs,
  );
  const critical = open.filter((alert) => alert.severity === AlertSeverity.CRITICAL);
  const selected = rows.find((alert) => alert.id === openId) ?? null;

  return (
    <ConsoleScreen title="Monitoring alerts" description={DESCRIPTION}>
      <AlertTiles
        open={open.length}
        breached={breached}
        critical={critical.length}
        shown={rows.length}
      />

      <ScreenPanel title="Queue" flush>
        <Queue
          queue={queue}
          columns={withTriage(alertColumns(nowMs), openId, setOpenId)}
          rows={rows}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </ScreenPanel>

      <ScreenPanel title="Triage">
        <AlertTriage alert={selected} investigations={investigations.data?.data ?? []} />
      </ScreenPanel>
    </ConsoleScreen>
  );
}
