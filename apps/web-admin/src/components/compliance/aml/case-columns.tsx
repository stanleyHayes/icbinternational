/**
 * The columns of the investigations list.
 *
 * Age is a column rather than a date, because the question a team lead asks of this list
 * is never "when was that opened" — it is "how long has that been sitting there". The
 * exact instant is one hover away for the times somebody needs to quote it.
 */

'use client';

import type { AmlCase } from '@reliance/contracts';
import { Badge, StatusPill } from '@reliance/ui';

import { caseTone, openColumn, severityTone } from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatElapsed, formatInstant, humaniseCode } from '@/lib/format';

const IDENTITY_COLUMNS: readonly DataColumn<AmlCase>[] = [
  {
    id: 'reference',
    header: 'Case',
    alwaysVisible: true,
    cell: (record) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">{record.reference}</span>
        <span className="font-body text-fg-muted text-xs">{record.customerName}</span>
      </span>
    ),
    csv: (record) => `${record.reference} — ${record.customerName}`,
  },
  {
    id: 'status',
    header: 'State',
    cell: (record) => (
      <StatusPill tone={caseTone(record.status)} label={humaniseCode(record.status)} />
    ),
    csv: (record) => humaniseCode(record.status),
  },
  {
    id: 'severity',
    header: 'Severity',
    cell: (record) => (
      <Badge tone={severityTone(record.severity)}>{humaniseCode(record.severity)}</Badge>
    ),
    csv: (record) => humaniseCode(record.severity),
  },
];

const OUTCOME_COLUMNS: readonly DataColumn<AmlCase>[] = [
  {
    id: 'alerts',
    header: 'Alerts',
    align: 'end',
    cell: (record) => (
      <span className="text-fg font-mono text-sm tabular-nums">{record.alertIds.length}</span>
    ),
    csv: (record) => String(record.alertIds.length),
    sortValue: (record) => record.alertIds.length,
  },
  {
    id: 'disposition',
    header: 'Outcome',
    cell: (record) => (
      <span className="font-body text-fg-muted text-sm">
        {record.disposition ? humaniseCode(record.disposition) : 'Not yet decided'}
      </span>
    ),
    csv: (record) => (record.disposition ? humaniseCode(record.disposition) : 'Not yet decided'),
  },
  {
    id: 'reported',
    header: 'Reported',
    cell: (record) =>
      record.suspiciousActivityReportFiled ? (
        <Badge tone="danger">Filed</Badge>
      ) : (
        <span className="font-body text-fg-subtle text-xs">No</span>
      ),
    csv: (record) => (record.suspiciousActivityReportFiled ? 'Filed' : 'No'),
  },
];

/** Columns for the investigations list, aged against the given instant. */
export function caseColumns(
  nowMs: number,
  openId: string | null,
  onOpen: (caseId: string) => void,
): readonly DataColumn<AmlCase>[] {
  const age: DataColumn<AmlCase> = {
    id: 'age',
    header: 'Open for',
    cell: (record) => (
      <span className="font-body text-fg-muted text-sm" title={formatInstant(record.openedAt)}>
        {formatElapsed(record.openedAt, nowMs).replace(' ago', '')}
      </span>
    ),
    csv: (record) => formatInstant(record.openedAt),
    sortValue: (record) => record.openedAt,
  };

  return [
    ...IDENTITY_COLUMNS,
    age,
    ...OUTCOME_COLUMNS,
    openColumn<AmlCase>({
      header: 'Workspace',
      idOf: (record) => record.id,
      openId,
      onOpen,
    }),
  ];
}
