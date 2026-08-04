/**
 * The CSV a customer downloads.
 *
 * Built in the browser from the exact rows the current filters produce, so the file and the
 * screen cannot disagree — the alternative is an asynchronous export job that re-runs the query
 * server-side against a feed that has moved on, and reconciling a download against a screenshot
 * is somebody's afternoon.
 *
 * Two details that matter more than they look. Amounts are written twice: once as exact integer
 * minor units, which is what a reconciliation needs, and once as a formatted major-unit figure,
 * which is what a spreadsheet's SUM needs. And any cell that begins with a formula character is
 * prefixed with an apostrophe, because a payee legitimately called `=Rent` becomes a live formula
 * the moment the file is opened, and CSV injection is a real way to attack somebody's laptop.
 */

import type { Transaction } from '@reliance/contracts';
import { formatMinorToMajor } from '@reliance/money';

import { signedMinor } from './amounts';
import { CATEGORY_LABEL, DIRECTION_LABEL, ENTRY_TYPE_LABEL, STATUS_LABEL } from './labels';

const HEADER: readonly string[] = [
  'Date',
  'Description',
  'Counterparty',
  'Reference',
  'Category',
  'Type',
  'Direction',
  'Status',
  'Amount',
  'Amount in minor units',
  'Currency',
  'Balance after',
];

/** Characters a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
const QUOTE = '"';
/** A quote inside a quoted CSV field is written twice. */
const ESCAPED_QUOTE = '""';
const ROW_SEPARATOR = '\r\n';

/** Quotes a value and neutralises anything a spreadsheet would execute. */
function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `${QUOTE}${safe.replaceAll(QUOTE, ESCAPED_QUOTE)}${QUOTE}`;
}

function row(transaction: Transaction): readonly string[] {
  const { amount, runningBalance } = transaction;
  const minor = signedMinor(transaction);

  return [
    transaction.bookedAt,
    transaction.description,
    transaction.counterparty?.name ?? '',
    transaction.reference ?? '',
    CATEGORY_LABEL[transaction.category],
    ENTRY_TYPE_LABEL[transaction.type],
    DIRECTION_LABEL[transaction.direction],
    STATUS_LABEL[transaction.status],
    formatMinorToMajor(minor, amount.currency),
    minor.toString(),
    amount.currency,
    formatMinorToMajor(BigInt(runningBalance.amount), runningBalance.currency),
  ];
}

/** Renders the movements as CSV text, header included. */
export function toCsv(transactions: readonly Transaction[]): string {
  const lines = [HEADER, ...transactions.map(row)].map((values) => values.map(cell).join(','));
  return `${lines.join(ROW_SEPARATOR)}${ROW_SEPARATOR}`;
}

/** A filename a customer can find again: `reliance-transactions-2026-08-03.csv`. */
export function csvFileName(isoDate: string): string {
  return `reliance-transactions-${isoDate.slice(0, 'YYYY-MM-DD'.length)}.csv`;
}

/**
 * Hands the file to the browser.
 *
 * A Blob URL rather than a data URI: a year of movements exceeds the length some browsers accept
 * in an address bar, and the failure mode is a silently empty download.
 */
export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
