/**
 * The dual-control queue's columns.
 *
 * The initiator's name is a first-class column rather than a detail, because it is what
 * tells an operator at a glance which rows are theirs to approve and which are their own
 * work waiting on somebody else. Sorting by it turns the queue into exactly that split.
 */

'use client';

import type { ApprovalRequest } from '@reliance/contracts';
import { Button, MoneyText, StatusPill } from '@reliance/ui';

import { toneForApproval } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatElapsed, formatInstant, humaniseCode } from '@/lib/format';

/** What the queue's columns need from the screen around them. */
export interface ApprovalColumnOptions {
  readonly nowMs: number;
  readonly onOpen: (request: ApprovalRequest) => void;
}

/** What the request is, who raised it, and where it stands. */
const REQUEST_COLUMNS: readonly DataColumn<ApprovalRequest>[] = [
  {
    id: 'kind',
    header: 'Request',
    alwaysVisible: true,
    cell: (row) => humaniseCode(row.kind),
    csv: (row) => row.kind,
  },
  {
    id: 'initiatedBy',
    header: 'Raised by',
    alwaysVisible: true,
    cell: (row) => row.initiatedBy.name,
    csv: (row) => row.initiatedBy.name,
    sortValue: (row) => row.initiatedBy.name,
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (row) =>
      row.amount ? (
        <MoneyText amount={row.amount.amount} currency={row.amount.currency} size="sm" muted />
      ) : (
        '—'
      ),
    csv: (row) => row.amount?.amount ?? '',
    sortValue: (row) => BigInt(row.amount?.amount ?? '0'),
  },
  {
    id: 'justification',
    header: 'Justification',
    cell: (row) => <span className="line-clamp-2">{row.justification}</span>,
    csv: (row) => row.justification,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <StatusPill tone={toneForApproval(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
  },
  {
    id: 'createdAt',
    header: 'Raised (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.createdAt)}</span>,
    csv: (row) => row.createdAt,
    sortValue: (row) => row.createdAt,
  },
  {
    id: 'decidedBy',
    header: 'Decided by',
    cell: (row) => row.decidedBy?.name ?? '—',
    csv: (row) => row.decidedBy?.name ?? '',
  },
];

/** The queue's columns. */
export function approvalColumns(
  options: ApprovalColumnOptions,
): readonly DataColumn<ApprovalRequest>[] {
  const { nowMs, onOpen } = options;

  return [
    ...REQUEST_COLUMNS,
    {
      id: 'expiresAt',
      header: 'Lapses',
      cell: (row) => <span title={row.expiresAt}>{formatElapsed(row.expiresAt, nowMs)}</span>,
      csv: (row) => row.expiresAt,
      sortValue: (row) => row.expiresAt,
    },
    {
      id: 'open',
      header: 'Decision',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Review
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}
