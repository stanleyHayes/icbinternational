/**
 * The exception list, and what resolving one looks like.
 *
 * An unmatched item is not a display problem, it is a task: either the rail is wrong and
 * we chase it, or we are wrong and the book needs an adjustment. The row therefore
 * carries the control that raises that adjustment, pre-filled from the item itself so an
 * operator is not retyping a reference at four in the afternoon.
 */

'use client';

import type { ReconciliationException } from '@reliance/api-client';
import { Permission } from '@reliance/contracts';
import { Badge, Button, MoneyText } from '@reliance/ui';

import type { PostingDraft } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant } from '@/lib/format';
import { Can } from '@/lib/permissions';

/** Where an unmatched item was seen. */
export const SIDE_LABEL: Readonly<Record<ReconciliationException['side'], string>> = {
  INTERNAL: 'On our ledger only',
  EXTERNAL: 'On the rail statement only',
};

/** Suspense account an unmatched item is adjusted against until it is explained. */
const SUSPENSE_CODE = '2900';

/** A manual posting pre-filled from an unmatched item. */
export function adjustmentFor(exception: ReconciliationException): Partial<PostingDraft> {
  const side = SIDE_LABEL[exception.side].toLowerCase();

  return {
    amount: exception.amount.amount.replace('-', ''),
    currency: exception.amount.currency,
    contraLedgerCode: SUSPENSE_CODE,
    narrative: `Reconciliation adjustment ${exception.reference}`,
    justification: `Unmatched ${side} for reference ${exception.reference}.`,
  };
}

/** The exception table's columns, bound to the adjustment dialog. */
/** Which side saw it, and what it called it. */
const IDENTITY_COLUMNS: readonly DataColumn<ReconciliationException>[] = [
  {
    id: 'side',
    header: 'Seen',
    alwaysVisible: true,
    cell: (row) => (
      <Badge tone={row.side === 'INTERNAL' ? 'info' : 'warning'}>{SIDE_LABEL[row.side]}</Badge>
    ),
    csv: (row) => SIDE_LABEL[row.side],
  },
  {
    id: 'reference',
    header: 'Reference',
    alwaysVisible: true,
    cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
    csv: (row) => row.reference,
  },
];

/** How much, when, and anything the matcher wanted to add. */
const DETAIL_COLUMNS: readonly DataColumn<ReconciliationException>[] = [
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (row) => (
      <MoneyText amount={row.amount.amount} currency={row.amount.currency} size="sm" />
    ),
    csv: (row) => row.amount.amount,
    // Sorted as a bigint: minor-unit strings sort as text, which puts £9 above £10.
    sortValue: (row) => BigInt(row.amount.amount),
  },
  {
    id: 'at',
    header: 'Seen at (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.at)}</span>,
    csv: (row) => row.at,
    sortValue: (row) => row.at,
  },
  { id: 'note', header: 'Note', cell: (row) => row.note ?? '—', csv: (row) => row.note ?? '' },
];

export function exceptionColumns(
  onAdjust: (exception: ReconciliationException) => void,
): readonly DataColumn<ReconciliationException>[] {
  return [
    ...IDENTITY_COLUMNS,
    ...DETAIL_COLUMNS,
    {
      id: 'resolve',
      header: 'Resolve',
      alwaysVisible: true,
      cell: (row) => (
        <Can permission={Permission.POSTING_INITIATE}>
          <Button size="sm" variant="ghost" onClick={() => onAdjust(row)}>
            Raise an adjustment
          </Button>
        </Can>
      ),
      csv: () => '',
    },
  ];
}
