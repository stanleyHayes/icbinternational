/**
 * The columns of the dispute queue.
 *
 * The provisional credit column is not decoration. A dispute where the customer already
 * has the money and a dispute where they do not are different conversations and different
 * risks, and an analyst who decides the first one against the customer is taking money
 * back out of a current account. Putting it in the queue means nobody opens a case without
 * knowing which kind it is.
 */

'use client';

import type { Dispute } from '@reliance/contracts';
import { Badge, MoneyText, StatusPill } from '@reliance/ui';

import {
  disputeTone,
  openColumn,
  SlaCell,
  slaSortValue,
  slaText,
} from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

const CLAIM_COLUMNS: readonly DataColumn<Dispute>[] = [
  {
    id: 'reason',
    header: 'Dispute',
    alwaysVisible: true,
    cell: (dispute) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">
          {humaniseCode(dispute.reason)}
        </span>
        <span className="font-body text-fg-muted text-xs">{dispute.description}</span>
      </span>
    ),
    csv: (dispute) => humaniseCode(dispute.reason),
  },
  {
    id: 'status',
    header: 'State',
    cell: (dispute) => (
      <StatusPill tone={disputeTone(dispute.status)} label={humaniseCode(dispute.status)} />
    ),
    csv: (dispute) => humaniseCode(dispute.status),
  },
  {
    id: 'amount',
    header: 'Disputed',
    align: 'end',
    cell: (dispute) => (
      <MoneyText
        amount={dispute.disputedAmount.amount}
        currency={dispute.disputedAmount.currency}
      />
    ),
    csv: (dispute) => dispute.disputedAmount.amount,
    sortValue: (dispute) => BigInt(dispute.disputedAmount.amount),
  },
  {
    id: 'provisional',
    header: 'Provisional credit',
    align: 'end',
    cell: (dispute) =>
      dispute.provisionalCredit ? (
        <MoneyText
          amount={dispute.provisionalCredit.amount}
          currency={dispute.provisionalCredit.currency}
          srLabel="Provisional credit given"
        />
      ) : (
        <span className="font-body text-fg-subtle text-xs">None given</span>
      ),
    csv: (dispute) => dispute.provisionalCredit?.amount ?? 'None',
    sortValue: (dispute) => BigInt(dispute.provisionalCredit?.amount ?? '0'),
  },
];

const EVIDENCE_COLUMNS: readonly DataColumn<Dispute>[] = [
  {
    id: 'evidence',
    header: 'Evidence',
    cell: (dispute) => (
      <Badge tone={dispute.evidenceIds.length === 0 ? 'warning' : 'neutral'}>
        {dispute.evidenceIds.length} file{dispute.evidenceIds.length === 1 ? '' : 's'}
      </Badge>
    ),
    csv: (dispute) => String(dispute.evidenceIds.length),
    sortValue: (dispute) => dispute.evidenceIds.length,
  },
  {
    id: 'merchant',
    header: 'Merchant response',
    cell: (dispute) => (
      <span className="font-body text-fg-muted text-xs">
        {dispute.merchantResponse ?? 'Nothing received'}
      </span>
    ),
    csv: (dispute) => dispute.merchantResponse ?? 'Nothing received',
  },
  {
    id: 'raised',
    header: 'Raised',
    cell: (dispute) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(dispute.createdAt)}</span>
    ),
    csv: (dispute) => formatInstant(dispute.createdAt),
    sortValue: (dispute) => dispute.createdAt,
  },
  {
    id: 'transaction',
    header: 'Posting',
    cell: (dispute) => (
      <span className="text-fg-subtle font-mono text-xs">{dispute.transactionId}</span>
    ),
    csv: (dispute) => dispute.transactionId,
  },
];

/** Columns for the dispute queue, measured against the given instant. */
export function disputeColumns(
  nowMs: number,
  openId: string | null,
  onOpen: (disputeId: string) => void,
): readonly DataColumn<Dispute>[] {
  const due: DataColumn<Dispute> = {
    id: 'due',
    header: 'Decision due',
    cell: (dispute) => (
      <SlaCell dueAt={dispute.decisionDueAt} nowMs={nowMs} settled={dispute.resolvedAt !== null} />
    ),
    csv: (dispute) => slaText(dispute.decisionDueAt, nowMs),
    sortValue: (dispute) => slaSortValue(dispute.decisionDueAt),
  };

  return [
    ...CLAIM_COLUMNS,
    due,
    ...EVIDENCE_COLUMNS,
    openColumn<Dispute>({ header: 'Case', idOf: (dispute) => dispute.id, openId, onOpen }),
  ];
}
