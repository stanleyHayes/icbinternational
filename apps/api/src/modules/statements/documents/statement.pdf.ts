/**
 * A statement, laid out as the bank issues it.
 *
 * The summary block comes before the transaction list on purpose. Almost everybody who
 * opens a statement is checking one of five numbers, and making them read three pages of
 * card spend to find the closing balance serves nobody.
 *
 * Amounts in the table are plain major units with no currency symbol; the currency is
 * declared once above them. A symbol on every line is noise, and it is the kind of noise
 * that stops the column adding up when somebody retypes it.
 */

import { TransactionDirection } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { type AccountRecord } from '../../accounts/index.js';
import { type TransactionRecord } from '../../transactions/repositories/transaction.store.js';
import { type StatementFigures } from '../statement-figures.js';
import { type StatementPeriod } from '../statement-period.js';

import { PdfPage, type Column } from './pdf-canvas.js';

/** Everything the page states. */
export interface StatementPdfInput {
  readonly bank: string;
  readonly account: AccountRecord;
  readonly period: StatementPeriod;
  readonly figures: StatementFigures;
  readonly records: readonly TransactionRecord[];
  readonly statementId: string;
}

const COLUMNS: readonly Column[] = [
  { header: 'Date', width: 62 },
  { header: 'Description', width: 195 },
  { header: 'Paid out', width: 75, align: 'right' },
  { header: 'Paid in', width: 75, align: 'right' },
  { header: 'Balance', width: 90, align: 'right' },
];

const ISO_DAY_LENGTH = 10;

export function renderStatementPdf(input: StatementPdfInput): Promise<Buffer> {
  return new PdfPage({
    title: `Statement ${input.period.label} — ${input.account.number}`,
    author: input.bank,
  })
    .letterhead({
      bank: input.bank,
      title: 'Account statement',
      subtitle: `${input.period.startDay} to ${input.period.endDay}`,
    })
    .heading('Account')
    .keyValues(accountRows(input))
    .heading('Summary')
    .keyValues(summaryRows(input.figures))
    .heading(`Transactions (amounts in ${input.account.currency})`)
    .table(COLUMNS, input.records.map(toRow))
    .footnote(footnoteLines(input))
    .render();
}

function accountRows(input: StatementPdfInput): (readonly [string, string])[] {
  return [
    ['Account name', input.account.nickname ?? input.account.productName],
    ['Account number', input.account.number],
    ['Sort code', input.account.sortCode],
    ['IBAN', input.account.iban],
    ['Currency', input.account.currency],
    ['Statement reference', input.statementId],
  ];
}

function summaryRows(figures: StatementFigures): (readonly [string, string])[] {
  return [
    ['Opening balance', figures.opening.format()],
    ['Paid in', figures.credits.format()],
    ['Paid out', figures.debits.format()],
    ['Closing balance', figures.closing.format()],
    ['Transactions', String(figures.count)],
  ];
}

function toRow(record: TransactionRecord): readonly string[] {
  const amount = fromStored(record.amount).toMajorString();
  const paidOut = record.direction === TransactionDirection.DEBIT ? amount : '';
  const paidIn = record.direction === TransactionDirection.CREDIT ? amount : '';

  return [
    record.bookedAt.toISOString().slice(0, ISO_DAY_LENGTH),
    record.counterparty?.name ?? record.description,
    paidOut,
    paidIn,
    fromStored(record.runningBalance).toMajorString(),
  ];
}

/**
 * Dated at the close of the period rather than at the moment of rendering.
 *
 * A statement is a statement of that period, and dating it "today" would make the same
 * document differ every time it was downloaded — so two copies of one month's statement
 * would not compare equal, which is the first thing anybody disputing one does.
 */
function footnoteLines(input: StatementPdfInput): string[] {
  return [
    `${input.bank} — statement dated ${input.period.endDay}.`,
    'The closing balance shown is the balance recorded against this account at the end of the period.',
    'Please tell us within 60 days if anything on this statement is not as you expect.',
  ];
}
