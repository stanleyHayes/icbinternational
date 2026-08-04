'use client';

/**
 * Reading a payment file, and refusing to guess.
 *
 * A bulk file is the highest-value single instruction a customer ever gives, so the parser is
 * deliberately unforgiving about structure and deliberately explicit about what it found. Every
 * row comes back with its original line number, so "row 42 is wrong" points at row 42 in the
 * spreadsheet the customer is looking at, not at row 41 of a zero-indexed array.
 *
 * Nothing here validates against the bank — that is the API's job, and it happens on the next
 * screen. This only decides whether the file is readable at all.
 */

const REQUIRED_HEADERS = ['name', 'sort code', 'account number', 'amount'] as const;
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const MINOR_UNITS_PER_MAJOR = 100n;
const DECIMAL_PLACES = 2;
const NON_DIGIT = /\D/g;

/** One row as the customer wrote it, with anything obviously wrong already named. */
export interface ParsedRow {
  /** Line number in the file, counting the header as line 1. */
  readonly lineNumber: number;
  readonly accountName: string;
  readonly sortCode: string;
  readonly accountNumber: string;
  /** Integer minor units, or `''` when the amount could not be read. */
  readonly amount: string;
  readonly reference: string;
  /** Why this row cannot be sent, or `null` when it looks fine. */
  readonly problem: string | null;
}

/** What came out of the file. */
export interface ParsedFile {
  readonly rows: readonly ParsedRow[];
  /** Why the whole file was rejected, when it was. */
  readonly fileProblem: string | null;
}

/** Major units as typed by a human into a spreadsheet, as integer minor units. */
function toMinorUnits(value: string): string | null {
  const cleaned = value.replaceAll(',', '').trim();
  if (!AMOUNT_PATTERN.test(cleaned)) return null;

  const [major = '0', fraction = ''] = cleaned.split('.');
  const padded = fraction.padEnd(DECIMAL_PLACES, '0');
  return (BigInt(major) * MINOR_UNITS_PER_MAJOR + BigInt(padded)).toString();
}

/** The first thing wrong with a row, or null. */
function problemWith(row: Omit<ParsedRow, 'problem'>): string | null {
  if (!row.accountName) return 'The name is missing.';
  if (!/^\d{6}$/.test(row.sortCode)) return 'The sort code must be six digits.';
  if (!/^\d{10}$/.test(row.accountNumber)) return 'The account number must be ten digits.';
  if (!row.amount) return 'The amount must be a number, such as 250 or 250.00.';
  if (row.amount === '0') return 'The amount must be more than zero.';
  return null;
}

/** Splits a line on commas, honouring quotes around a field that contains one. */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      fields.push(current.trim());
      current = '';
    } else current += character;
  }
  fields.push(current.trim());

  return fields;
}

const HEADER_LINE = 1;

function buildRow(fields: readonly string[], lineNumber: number): ParsedRow {
  const [name = '', sortCode = '', accountNumber = '', amount = '', reference = ''] = fields;
  const base = {
    lineNumber,
    accountName: name.trim(),
    sortCode: sortCode.replaceAll(NON_DIGIT, ''),
    accountNumber: accountNumber.replaceAll(NON_DIGIT, ''),
    amount: toMinorUnits(amount) ?? '',
    reference: reference.trim(),
  };

  return { ...base, problem: problemWith(base) };
}

/**
 * Parses a payment file.
 *
 * @param text the file's contents, as UTF-8 text.
 */
export function parsePaymentFile(text: string): ParsedFile {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0];

  if (!header) {
    return { rows: [], fileProblem: 'That file is empty.' };
  }

  const columns = splitLine(header).map((column) => column.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((required) => !columns.includes(required));
  if (missing.length > 0) {
    return {
      rows: [],
      fileProblem: `The first row of the file must name the columns: ${REQUIRED_HEADERS.join(', ')}. Missing: ${missing.join(', ')}.`,
    };
  }

  const rows = lines
    .slice(1)
    .map((line, index) => buildRow(splitLine(line), index + HEADER_LINE + 1));

  return {
    rows,
    fileProblem: rows.length === 0 ? 'That file has column names but no payments in it.' : null,
  };
}
