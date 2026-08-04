/**
 * CSV export.
 *
 * Two things are easy to get wrong here and both matter in a bank. A value containing a
 * comma, a quote or a newline has to be quoted and its quotes doubled, or the export
 * silently shifts every column after it — a reconciliation file that looks fine and is
 * wrong. And a cell beginning `=`, `+`, `-` or `@` is treated as a formula by every
 * spreadsheet on the market, which turns an exported customer note into code that runs
 * on the analyst's machine. Both are handled here so no caller has to remember them.
 */

/** Separator between records. CRLF is what RFC 4180 specifies and what Excel expects. */
const RECORD_SEPARATOR = '\r\n';

/** Leading characters a spreadsheet interprets as the start of a formula. */
const FORMULA_LEADERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Prefixed to a value that would otherwise be read as a formula. */
const FORMULA_GUARD = "'";

const NEEDS_QUOTING = /[",\r\n]/;

/** One exportable column: a header and how to read the cell from a row. */
export interface CsvColumn<T> {
  /** Text of the header cell. */
  readonly header: string;
  /** The cell value. Return an empty string for "not set" rather than a placeholder. */
  readonly value: (row: T) => string;
}

function escapeCell(raw: string): string {
  const guarded = FORMULA_LEADERS.has(raw.charAt(0)) ? `${FORMULA_GUARD}${raw}` : raw;
  if (!NEEDS_QUOTING.test(guarded)) return guarded;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** Serialises one row of already-stringified cells. */
export function toCsvRow(cells: readonly string[]): string {
  return cells.map(escapeCell).join(',');
}

/**
 * Serialises rows to CSV text, header first.
 *
 * The result is exactly what the operator sees on screen for the columns they chose —
 * an export that quietly includes hidden columns, or omits a filter, is an export nobody
 * can reconcile against the screen it came from.
 */
export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [toCsvRow(columns.map((column) => column.header))];
  for (const row of rows) lines.push(toCsvRow(columns.map((column) => column.value(row))));
  return lines.join(RECORD_SEPARATOR);
}

/** Byte-order mark, so Excel opens a UTF-8 export without mangling accented names. */
const UTF8_BOM = '﻿';

/**
 * Hands a CSV file to the browser's download mechanism.
 *
 * @param filename Name offered to the operator, without a path.
 * @param csv Text produced by {@link toCsv}.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Length of `YYYYMMDD-HHMMSS`, which is as much of an instant as a filename needs. */
const STAMP_LENGTH = 15;

/** A stable, sortable filename: `approvals-20260803-142207.csv`. */
export function csvFilename(base: string, isoInstant: string): string {
  const compact = isoInstant.replaceAll(/[-:]/g, '').replace('T', '-').slice(0, STAMP_LENGTH);
  return `${base}-${compact}.csv`;
}
