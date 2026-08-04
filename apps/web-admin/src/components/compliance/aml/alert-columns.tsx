/**
 * The columns of the monitoring queue.
 *
 * Severity and score are both shown because they are not the same thing. Severity is what
 * the rule author decided the pattern is worth; the score is what this particular
 * customer's behaviour scored against it. A `LOW` rule firing at 94 is often more
 * interesting than a `HIGH` rule scraping 41, and a queue that shows only one of them
 * hides that entirely.
 */

'use client';

import type { AmlAlert } from '@reliance/contracts';
import { Badge, StatusPill } from '@reliance/ui';

import {
  alertTone,
  severityTone,
  SlaCell,
  slaSortValue,
  slaText,
} from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

const SUBJECT_COLUMNS: readonly DataColumn<AmlAlert>[] = [
  {
    id: 'customer',
    header: 'Customer',
    alwaysVisible: true,
    cell: (alert) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">{alert.customerName}</span>
        <span className="text-fg-subtle font-mono text-xs">{alert.userId}</span>
      </span>
    ),
    csv: (alert) => alert.customerName,
  },
  {
    id: 'rule',
    header: 'What fired',
    alwaysVisible: true,
    cell: (alert) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm">{alert.ruleName}</span>
        <span className="font-body text-fg-muted text-xs">{alert.summary}</span>
      </span>
    ),
    csv: (alert) => `${alert.ruleName}: ${alert.summary}`,
  },
  {
    id: 'severity',
    header: 'Severity',
    cell: (alert) => (
      <Badge tone={severityTone(alert.severity)}>{humaniseCode(alert.severity)}</Badge>
    ),
    csv: (alert) => humaniseCode(alert.severity),
  },
  {
    id: 'score',
    header: 'Score',
    align: 'end',
    cell: (alert) => <span className="text-fg font-mono text-sm tabular-nums">{alert.score}</span>,
    csv: (alert) => String(alert.score),
    sortValue: (alert) => alert.score,
  },
  {
    id: 'status',
    header: 'State',
    cell: (alert) => (
      <StatusPill tone={alertTone(alert.status)} label={humaniseCode(alert.status)} />
    ),
    csv: (alert) => humaniseCode(alert.status),
  },
];

const CONTEXT_COLUMNS: readonly DataColumn<AmlAlert>[] = [
  {
    id: 'transactions',
    header: 'Postings',
    cell: (alert) => (
      <span className="font-body text-fg-muted text-sm">{alert.relatedTransactionIds.length}</span>
    ),
    csv: (alert) => String(alert.relatedTransactionIds.length),
    sortValue: (alert) => alert.relatedTransactionIds.length,
  },
  {
    id: 'case',
    header: 'Investigation',
    cell: (alert) => (
      <span className="text-fg-subtle font-mono text-xs">{alert.caseId ?? 'Not attached'}</span>
    ),
    csv: (alert) => alert.caseId ?? 'Not attached',
  },
  {
    id: 'raised',
    header: 'Raised',
    cell: (alert) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(alert.raisedAt)}</span>
    ),
    csv: (alert) => formatInstant(alert.raisedAt),
    sortValue: (alert) => alert.raisedAt,
  },
];

/** Columns for the monitoring alert queue, measured against the given instant. */
export function alertColumns(nowMs: number): readonly DataColumn<AmlAlert>[] {
  const sla: DataColumn<AmlAlert> = {
    id: 'sla',
    header: 'Triage due',
    cell: (alert) => (
      <SlaCell dueAt={alert.slaDueAt} nowMs={nowMs} settled={alert.closedAt !== null} />
    ),
    csv: (alert) => slaText(alert.slaDueAt, nowMs),
    sortValue: (alert) => slaSortValue(alert.slaDueAt),
  };

  return [...SUBJECT_COLUMNS, sla, ...CONTEXT_COLUMNS];
}
