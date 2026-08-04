import { TransactionDirection } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { type TransactionRecord } from '../repositories/transaction.store.js';

/**
 * RFC 4180 CSV, for the spreadsheet every customer eventually opens.
 *
 * Amounts are written in **major units as a plain decimal string** — `-12.50`, not
 * `-1250` and not `£12.50`. Minor units confuse a human reader and a currency symbol
 * makes the column text in every spreadsheet application, which is how an export becomes
 * useless the moment someone tries to sum it. The currency travels in its own column.
 *
 * The sign is restored here: storage keeps a magnitude plus a direction because that is
 * how a ledger works, but a spreadsheet column of unsigned numbers cannot be totalled.
 */

/** One column: its header, and how to read it off a row. */
export interface CsvColumn {
  readonly header: string;
  readonly value: (record: TransactionRecord) => string;
}

/**
 * The export's shape, declared once.
 *
 * A single ordered list means the header row and the body cannot disagree about column
 * order — the classic way a CSV export silently shifts every value one column left.
 */
export const CSV_COLUMNS: readonly CsvColumn[] = [
  { header: 'Date', value: (record) => record.bookedAt.toISOString() },
  { header: 'Transaction ID', value: (record) => record.id },
  { header: 'Journal Entry ID', value: (record) => record.journalEntryId },
  { header: 'Account ID', value: (record) => record.accountId },
  { header: 'Type', value: (record) => record.type },
  { header: 'Status', value: (record) => record.status },
  { header: 'Description', value: (record) => record.description },
  { header: 'Counterparty', value: (record) => record.counterparty?.name ?? '' },
  { header: 'Reference', value: (record) => record.reference ?? '' },
  { header: 'Category', value: (record) => record.category },
  { header: 'Direction', value: (record) => record.direction },
  { header: 'Amount', value: (record) => signedMajorAmount(record) },
  { header: 'Currency', value: (record) => record.amount.currency },
  { header: 'Balance', value: (record) => fromStored(record.runningBalance).toMajorString() },
  { header: 'Notes', value: (record) => record.notes ?? '' },
];

/**
 * Renders rows as a CSV document.
 *
 * CRLF line endings and a header row, per RFC 4180 — Excel on Windows misreads a bare LF
 * file with quoted fields containing newlines, and a customer's transaction narrative can
 * contain anything.
 */
export function toCsv(records: readonly TransactionRecord[]): string {
  const header = CSV_COLUMNS.map((column) => escapeCsvField(column.header));
  const body = records.map((record) =>
    CSV_COLUMNS.map((column) => escapeCsvField(column.value(record))),
  );

  return (
    [header, ...body].map((row) => row.join(FIELD_SEPARATOR)).join(ROW_SEPARATOR) + ROW_SEPARATOR
  );
}

const FIELD_SEPARATOR = ',';
const ROW_SEPARATOR = '\r\n';

const QUOTE = '"';
const MUST_QUOTE = /["\n\r,]/;

/**
 * Quotes a field only when it needs it, and doubles any embedded quote.
 *
 * Quoting unconditionally would be simpler and is what most exporters do, but it makes
 * every column in the file a string in every spreadsheet application — including the
 * amount column, which is the one people came for.
 */
export function escapeCsvField(value: string): string {
  if (!MUST_QUOTE.test(value)) return value;
  return `${QUOTE}${value.split(QUOTE).join(QUOTE + QUOTE)}${QUOTE}`;
}

/** Magnitude plus direction, restored to a signed decimal a spreadsheet can total. */
function signedMajorAmount(record: TransactionRecord): string {
  const amount = fromStored(record.amount);
  const signed = record.direction === TransactionDirection.DEBIT ? amount.negate() : amount;
  return signed.toMajorString();
}
