import { TransactionDirection } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { type TransactionRecord } from '../repositories/transaction.store.js';

/**
 * A single transaction rendered as a plain-text receipt.
 *
 * Plain text rather than PDF, deliberately. A PDF receipt looks like a document the bank
 * has attested to, and this one is a convenience copy of a row a customer can already
 * see — the attested artefact is the statement, produced by the statements pipeline with
 * a closing balance the ledger has signed off. Text is honest about what it is, opens
 * everywhere, and can be pasted into an expense claim without a converter.
 *
 * There is no `receiptSchema` in the frozen contract, so `routes.transactions.receipt`
 * answers `text/plain`. A typed receipt resource is logged in `docs/CONTRACT_CHANGES.md`.
 */
export function renderReceipt(record: TransactionRecord): string {
  const amount = fromStored(record.amount);
  const sign = record.direction === TransactionDirection.DEBIT ? '-' : '+';

  return [
    'RELIANCE BANK',
    'Transaction receipt',
    DIVIDER,
    ...lines(record, `${sign}${amount.format()}`),
    DIVIDER,
    `Reference ${record.reference ?? '—'}`,
    `Receipt for transaction ${record.id}`,
    'This receipt reflects the ledger at the time it was produced.',
    '',
  ].join(LINE_SEPARATOR);
}

function lines(record: TransactionRecord, amount: string): string[] {
  const rows: [string, string | null][] = [
    ['Date', record.bookedAt.toISOString()],
    ['Description', record.description],
    ['Counterparty', record.counterparty?.name ?? null],
    ['Amount', amount],
    ['Balance after', fromStored(record.runningBalance).format()],
    ['Status', record.status],
    ['Category', record.category],
    ['Account', record.accountId],
    ['Journal entry', record.journalEntryId],
    ['Note', record.notes],
  ];

  return rows
    .filter((row): row is [string, string] => row[1] !== null)
    .map(([label, value]) => `${label.padEnd(LABEL_WIDTH)}${value}`);
}

const LABEL_WIDTH = 16;
const LINE_SEPARATOR = '\n';
/** Fits an 80-column terminal and a narrow phone screen without wrapping. */
const RECEIPT_WIDTH = 48;
const DIVIDER = '-'.repeat(RECEIPT_WIDTH);
