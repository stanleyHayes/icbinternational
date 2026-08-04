/**
 * The collections queue's columns.
 *
 * Days past due leads, because it decides both what the bank is allowed to do next and
 * what it has to have done already. The outstanding balance is beside the arrears amount
 * on purpose: a customer two payments behind on a loan they have nearly cleared is a very
 * different conversation from one two payments into a five-year term.
 */

'use client';

import type { Loan } from '@reliance/contracts';
import { Badge, Button, MoneyText, StatusPill } from '@reliance/ui';

import { toneForLoan } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatDate, humaniseCode, shortenId } from '@/lib/format';

import { AGEING_BUCKETS } from './ageing';

function bandFor(loan: Loan): string {
  const bucket = AGEING_BUCKETS.find(
    (candidate) =>
      loan.daysPastDue >= candidate.fromDays &&
      (candidate.toDays === null || loan.daysPastDue < candidate.toDays),
  );
  return bucket?.label ?? 'Up to date';
}

/** Which loan it is, and how far behind. */
const IDENTITY_COLUMNS: readonly DataColumn<Loan>[] = [
  {
    id: 'loan',
    header: 'Loan',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span>{row.productName}</span>
        <span className="text-fg-muted font-mono text-xs" title={row.id}>
          {shortenId(row.id)}
        </span>
      </span>
    ),
    csv: (row) => `${row.productName} ${row.id}`,
  },
  {
    id: 'daysPastDue',
    header: 'Days past due',
    align: 'end',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex items-center justify-end gap-2">
        {row.daysPastDue}
        <Badge tone="neutral">{bandFor(row)}</Badge>
      </span>
    ),
    csv: (row) => String(row.daysPastDue),
    sortValue: (row) => row.daysPastDue,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusPill tone={toneForLoan(row.status)} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
  },
];

/** What is owed, against what is still outstanding. */
const POSITION_COLUMNS: readonly DataColumn<Loan>[] = [
  {
    id: 'arrears',
    header: 'In arrears',
    align: 'end',
    alwaysVisible: true,
    cell: (row) => (
      <MoneyText
        amount={row.arrearsAmount.amount}
        currency={row.arrearsAmount.currency}
        size="sm"
      />
    ),
    csv: (row) => row.arrearsAmount.amount,
    sortValue: (row) => BigInt(row.arrearsAmount.amount),
  },
  {
    id: 'outstanding',
    header: 'Outstanding',
    align: 'end',
    cell: (row) => (
      <MoneyText
        amount={row.outstandingBalance.amount}
        currency={row.outstandingBalance.currency}
        size="sm"
        muted
      />
    ),
    csv: (row) => row.outstandingBalance.amount,
    sortValue: (row) => BigInt(row.outstandingBalance.amount),
  },
  {
    id: 'monthlyPayment',
    header: 'Monthly payment',
    align: 'end',
    cell: (row) => (
      <MoneyText
        amount={row.monthlyPayment.amount}
        currency={row.monthlyPayment.currency}
        size="sm"
        muted
      />
    ),
    csv: (row) => row.monthlyPayment.amount,
  },
  {
    id: 'nextPaymentDate',
    header: 'Next payment',
    cell: (row) => (row.nextPaymentDate ? formatDate(row.nextPaymentDate) : '—'),
    csv: (row) => row.nextPaymentDate ?? '',
    sortValue: (row) => row.nextPaymentDate ?? '',
  },
  {
    id: 'apr',
    header: 'Rate',
    align: 'end',
    cell: (row) => formatBasisPoints(row.aprBps),
    csv: (row) => String(row.aprBps),
    sortValue: (row) => row.aprBps,
  },
];

/** The queue's columns, bound to the collections panel. */
export function arrearsColumns(onOpen: (loan: Loan) => void): readonly DataColumn<Loan>[] {
  return [
    ...IDENTITY_COLUMNS,
    ...POSITION_COLUMNS,
    {
      id: 'open',
      header: 'Collections',
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
