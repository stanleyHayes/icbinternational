'use client';

/**
 * Every row in the file, with what is wrong with it, before anything is sent.
 *
 * The whole point of a bulk wizard is this table. A file that is uploaded and then partially fails
 * leaves a customer reconciling forty payments by hand; a file whose bad rows are named up front
 * costs them one edit in a spreadsheet.
 *
 * Problems are stated per row, in words, next to the row they belong to. A count at the top of the
 * screen is not a validation report.
 */

import { MoneyText, StatusPill, Table, type TableColumn } from '@reliance/ui';

import type { ParsedRow } from './parse-csv';

const SORT_CODE_GROUP = /(\d{2})(?=\d)/g;

/** Props for {@link BulkPreview}. */
export interface BulkPreviewProps {
  readonly rows: readonly ParsedRow[];
  readonly currency: string;
}

function statusCell(row: ParsedRow) {
  return row.problem ? (
    <StatusPill tone="danger" label="Cannot be sent" />
  ) : (
    <StatusPill tone="credit" label="Ready" />
  );
}

/** The columns, built with the file's currency so amounts render correctly. */
function columnsFor(currency: string): TableColumn<ParsedRow>[] {
  return [
    { id: 'line', header: 'Row', cell: (row) => row.lineNumber },
    { id: 'name', header: 'Name', cell: (row) => row.accountName || '—' },
    {
      id: 'account',
      header: 'Account',
      cell: (row) =>
        row.sortCode && row.accountNumber
          ? `${row.sortCode.replaceAll(SORT_CODE_GROUP, '$1-')} · ${row.accountNumber}`
          : '—',
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'end',
      cell: (row) =>
        row.amount ? <MoneyText amount={row.amount} currency={currency as never} muted /> : '—',
    },
    { id: 'reference', header: 'Reference', cell: (row) => row.reference || '—' },
    { id: 'status', header: 'Status', cell: statusCell },
    {
      id: 'problem',
      header: 'What to fix',
      cell: (row) => <span className="text-danger">{row.problem ?? ''}</span>,
    },
  ];
}

/**
 * @example <BulkPreview rows={rows} currency="GBP" />
 */
export function BulkPreview({ rows, currency }: BulkPreviewProps) {
  return (
    <Table
      caption="Every payment in the file, with anything that needs fixing"
      columns={columnsFor(currency)}
      rows={rows}
      rowKey={(row) => String(row.lineNumber)}
    />
  );
}
