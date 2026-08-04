/**
 * The columns of the posting search.
 *
 * Amounts sort as `bigint` minor units rather than as their rendered text, which is the
 * difference between an amount column that orders correctly and one that puts £9.99 above
 * £1,000.00. Every column carries its own text form, so the export is exactly the screen.
 */

'use client';

import type { Transaction } from '@reliance/contracts';
import { Button, Checkbox, MoneyText, StatusPill } from '@reliance/ui';

import { toneForTransaction, type Selection } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode, shortenId } from '@/lib/format';

/** Text written into the export for a row's selection state. */
const SELECTED = 'selected';

/** What the columns need from the screen around them. */
export interface PostingColumnOptions {
  readonly selection: Selection;
  /** Opens the posting and the entry beneath it. */
  readonly onInspect: (posting: Transaction) => void;
}

function selectionColumn(selection: Selection): DataColumn<Transaction> {
  return {
    id: 'selected',
    header: 'Select',
    alwaysVisible: true,
    className: 'w-10',
    cell: (row) => (
      <Checkbox
        checked={selection.isSelected(row.id)}
        onChange={() => selection.toggle(row.id)}
        aria-label={`Select posting ${row.description}`}
      />
    ),
    csv: (row) => (selection.isSelected(row.id) ? SELECTED : ''),
  };
}

/** Narrative and counterparty as one line, for the export. */
function narrativeText(row: Transaction): string {
  const counterparty = row.counterparty ? ` — ${row.counterparty.name}` : '';
  return `${row.description}${counterparty}`;
}

/** What the posting is and who it belongs to. */
const IDENTITY_COLUMNS: readonly DataColumn<Transaction>[] = [
  {
    id: 'bookedAt',
    header: 'Booked (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.bookedAt)}</span>,
    csv: (row) => row.bookedAt,
    sortValue: (row) => row.bookedAt,
    alwaysVisible: true,
  },
  {
    id: 'description',
    header: 'Narrative',
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{row.description}</span>
        {row.counterparty && (
          <span className="text-fg-muted truncate text-xs">{row.counterparty.name}</span>
        )}
      </span>
    ),
    csv: (row) => narrativeText(row),
    alwaysVisible: true,
  },
  {
    id: 'account',
    header: 'Account',
    cell: (row) => (
      <span className="font-mono text-xs" title={row.accountId}>
        {shortenId(row.accountId)}
      </span>
    ),
    csv: (row) => row.accountId,
  },
  {
    id: 'type',
    header: 'Entry type',
    cell: (row) => humaniseCode(row.type),
    csv: (row) => row.type,
  },
  {
    id: 'reference',
    header: 'Reference',
    cell: (row) => row.reference ?? '—',
    csv: (row) => row.reference ?? '',
  },
];

/** The money, and where it left the balance. */
const FIGURE_COLUMNS: readonly DataColumn<Transaction>[] = [
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (row) => (
      <MoneyText amount={row.amount.amount} currency={row.amount.currency} signed size="sm" />
    ),
    csv: (row) => row.amount.amount,
    sortValue: (row) => BigInt(row.amount.amount),
  },
  {
    id: 'runningBalance',
    header: 'Balance after',
    align: 'end',
    cell: (row) => (
      <MoneyText
        amount={row.runningBalance.amount}
        currency={row.runningBalance.currency}
        size="sm"
        muted
      />
    ),
    csv: (row) => row.runningBalance.amount,
    sortValue: (row) => BigInt(row.runningBalance.amount),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <StatusPill tone={toneForTransaction(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
  },
];

/** The posting-search columns, bound to the screen's selection and inspector. */
export function postingColumns(options: PostingColumnOptions): readonly DataColumn<Transaction>[] {
  return [
    selectionColumn(options.selection),
    ...IDENTITY_COLUMNS,
    ...FIGURE_COLUMNS,
    {
      id: 'inspect',
      header: 'Entry',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => options.onInspect(row)}>
          Inspect
        </Button>
      ),
      // The export names the entry rather than repeating the control, so a reconciled
      // spreadsheet still points at the record it came from.
      csv: (row) => row.journalEntryId,
    },
  ];
}
