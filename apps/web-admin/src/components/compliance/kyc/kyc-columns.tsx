/**
 * The columns of the identity-review queue.
 *
 * Ordered the way a case is worked: who, what state, how long it has been waiting, what
 * tier is being asked for, and how much evidence there is to look at. The document count
 * is on the queue deliberately — a case with one blurred passport and a case with six
 * files take very different amounts of time, and an analyst planning their morning needs
 * to see which is which before opening anything.
 */

'use client';

import type { KycCase } from '@reliance/contracts';
import { Badge, StatusPill } from '@reliance/ui';

import { kycTone, riskTone, SlaCell, slaSortValue, slaText } from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

import type { CustomerLabel } from '../data/use-customer-names';

const MS_PER_HOUR = 3_600_000;

/**
 * The bank tells customers a submitted application is decided within two working days.
 * That promise is the SLA the queue is worked against, so it lives next to the queue.
 */
const DECISION_WINDOW_HOURS = 48;

/** When the bank has committed to answering this application. */
export function decisionDueAt(record: KycCase): string | null {
  if (!record.submittedAt) return null;
  const due = new Date(record.submittedAt).getTime() + DECISION_WINDOW_HOURS * MS_PER_HOUR;
  return new Date(due).toISOString();
}

/** Resolves a case's customer, or falls back to the identifier. */
type Resolve = (record: KycCase) => CustomerLabel | undefined;

function identityColumns(resolve: Resolve): readonly DataColumn<KycCase>[] {
  return [
    {
      id: 'customer',
      header: 'Customer',
      alwaysVisible: true,
      cell: (record) => (
        <span className="flex flex-col">
          <span className="font-body text-fg text-sm font-medium">
            {resolve(record)?.name ?? record.userId}
          </span>
          <span className="font-body text-fg-muted text-xs">{resolve(record)?.email ?? ''}</span>
        </span>
      ),
      csv: (record) => resolve(record)?.name ?? record.userId,
    },
    {
      id: 'status',
      header: 'State',
      cell: (record) => (
        <StatusPill tone={kycTone(record.status)} label={humaniseCode(record.status)} />
      ),
      csv: (record) => humaniseCode(record.status),
    },
    {
      id: 'tier',
      header: 'Tier',
      cell: (record) => (
        <span className="font-body text-fg text-sm">
          {record.currentTier} → {record.requestedTier}
        </span>
      ),
      csv: (record) => `${record.currentTier} to ${record.requestedTier}`,
      sortValue: (record) => record.requestedTier,
    },
  ];
}

function slaColumn(nowMs: number): DataColumn<KycCase> {
  return {
    id: 'sla',
    header: 'Decision due',
    cell: (record) => (
      <SlaCell dueAt={decisionDueAt(record)} nowMs={nowMs} settled={record.decidedAt !== null} />
    ),
    csv: (record) => slaText(decisionDueAt(record), nowMs),
    sortValue: (record) => slaSortValue(decisionDueAt(record)),
  };
}

const EVIDENCE_COLUMNS: readonly DataColumn<KycCase>[] = [
  {
    id: 'documents',
    header: 'Evidence',
    cell: (record) => (
      <span className="font-body text-fg-muted text-sm">
        {record.documents.length} document{record.documents.length === 1 ? '' : 's'}
      </span>
    ),
    csv: (record) => String(record.documents.length),
    sortValue: (record) => record.documents.length,
  },
  {
    id: 'risk',
    header: 'Risk',
    cell: (record) =>
      record.riskRating ? (
        <Badge tone={riskTone(record.riskRating)}>{humaniseCode(record.riskRating)}</Badge>
      ) : (
        <span className="font-body text-fg-subtle text-xs">Not yet rated</span>
      ),
    csv: (record) => (record.riskRating ? humaniseCode(record.riskRating) : 'Not yet rated'),
  },
  {
    id: 'submitted',
    header: 'Submitted',
    cell: (record) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(record.submittedAt)}</span>
    ),
    csv: (record) => formatInstant(record.submittedAt),
    sortValue: (record) => record.submittedAt ?? '',
  },
  {
    id: 'nextStep',
    header: 'Waiting on',
    cell: (record) => (
      <span className="font-body text-fg-muted text-sm">
        {record.nextStep ? humaniseCode(record.nextStep) : 'Nothing — ready to decide'}
      </span>
    ),
    csv: (record) => (record.nextStep ? humaniseCode(record.nextStep) : 'Ready to decide'),
  },
  {
    id: 'id',
    header: 'Case',
    cell: (record) => <span className="text-fg-subtle font-mono text-xs">{record.id}</span>,
    csv: (record) => record.id,
  },
];

/** Builds the queue columns against a resolved set of customer names. */
export function kycColumns(
  labels: ReadonlyMap<string, CustomerLabel> | undefined,
  nowMs: number,
): readonly DataColumn<KycCase>[] {
  const resolve: Resolve = (record) => labels?.get(record.userId);
  return [...identityColumns(resolve), slaColumn(nowMs), ...EVIDENCE_COLUMNS];
}
