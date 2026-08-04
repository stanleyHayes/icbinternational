/**
 * The underwriting queue's columns.
 *
 * Ordered by how long an application has been waiting rather than by size, because the
 * commitment the bank made is about time: an applicant told "we'll come back within two
 * working days" is owed that regardless of how much they asked for.
 */

'use client';

import type { LoanApplication } from '@reliance/contracts';
import { Button, MoneyText, StatusPill } from '@reliance/ui';

import { toneForApplication } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatElapsed, formatInstant, humaniseCode } from '@/lib/format';

/** What the columns need from the screen around them. */
export interface ApplicationColumnOptions {
  readonly nowMs: number;
  readonly onOpen: (application: LoanApplication) => void;
}

/** What was asked for, and what was decided. */
const REQUEST_COLUMNS: readonly DataColumn<LoanApplication>[] = [
  {
    id: 'productCode',
    header: 'Product',
    alwaysVisible: true,
    cell: (row) => row.productCode,
    csv: (row) => row.productCode,
  },
  {
    id: 'requestedAmount',
    header: 'Requested',
    align: 'end',
    alwaysVisible: true,
    cell: (row) => (
      <MoneyText
        amount={row.requestedAmount.amount}
        currency={row.requestedAmount.currency}
        size="sm"
        muted
      />
    ),
    csv: (row) => row.requestedAmount.amount,
    sortValue: (row) => BigInt(row.requestedAmount.amount),
  },
  {
    id: 'termMonths',
    header: 'Term',
    align: 'end',
    cell: (row) => `${String(row.termMonths)} months`,
    csv: (row) => String(row.termMonths),
    sortValue: (row) => row.termMonths,
  },
  { id: 'purpose', header: 'Purpose', cell: (row) => row.purpose, csv: (row) => row.purpose },
  {
    id: 'status',
    header: 'Status',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill tone={toneForApplication(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
  },
  {
    id: 'offer',
    header: 'Offered rate',
    align: 'end',
    cell: (row) => (row.offer ? formatBasisPoints(row.offer.aprBps) : '—'),
    csv: (row) => (row.offer ? String(row.offer.aprBps) : ''),
    sortValue: (row) => row.offer?.aprBps ?? 0,
  },
  {
    id: 'decidedAt',
    header: 'Decided (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.decidedAt)}</span>,
    csv: (row) => row.decidedAt ?? '',
  },
];

/** The queue's columns. */
export function applicationColumns(
  options: ApplicationColumnOptions,
): readonly DataColumn<LoanApplication>[] {
  const { nowMs, onOpen } = options;

  return [
    ...REQUEST_COLUMNS,
    {
      id: 'submittedAt',
      header: 'Waiting',
      alwaysVisible: true,
      cell: (row) => (
        <span title={row.submittedAt ?? 'Not submitted'}>
          {row.submittedAt ? formatElapsed(row.submittedAt, nowMs) : 'Not submitted'}
        </span>
      ),
      csv: (row) => row.submittedAt ?? '',
      sortValue: (row) => row.submittedAt ?? '',
    },
    {
      id: 'open',
      header: 'Underwrite',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}
