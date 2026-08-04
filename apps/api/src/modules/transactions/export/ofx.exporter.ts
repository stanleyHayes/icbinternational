import { EntryType, TransactionDirection } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { type TransactionRecord } from '../repositories/transaction.store.js';

/**
 * OFX 1.0.2 (SGML), the format Quicken, GnuCash, MoneyDance and every desktop accounting
 * package still read.
 *
 * SGML rather than the XML of OFX 2.x on purpose: importers accept 1.x essentially
 * universally and 2.x patchily, and the point of this export is that it opens in whatever
 * the customer already uses. Tags are unclosed, which is legal here and is what the
 * parsers expect.
 *
 * Amounts are signed major units — OFX has no direction field, the sign *is* the
 * direction — and timestamps are `YYYYMMDDHHMMSS` in UTC with an explicit `[0:GMT]`
 * suffix. Omitting the zone makes the importer assume local time and shift every
 * transaction by the customer's offset, which lands month-end spend in the wrong month.
 */

/** What the statement wrapper needs beyond the rows themselves. */
export interface OfxStatementInput {
  readonly accountId: string;
  readonly records: readonly TransactionRecord[];
  readonly currency: string;
  readonly closingBalance: string;
  readonly generatedAt: Date;
  readonly from: Date;
  readonly to: Date;
}

/** Renders a full OFX bank statement download. */
export function toOfx(input: OfxStatementInput): string {
  const at = toOfxTimestamp(input.generatedAt);

  return [
    OFX_HEADER,
    '<OFX>',
    signOnBlock(at),
    `<BANKMSGSRSV1><STMTTRNRS><TRNUID>${input.accountId}<STATUS><CODE>0<SEVERITY>INFO</STATUS>`,
    `<STMTRS><CURDEF>${input.currency}`,
    `<BANKACCTFROM><BANKID>${BANK_ROUTING_ID}<ACCTID>${input.accountId}<ACCTTYPE>CHECKING</BANKACCTFROM>`,
    transactionListBlock(input),
    `<LEDGERBAL><BALAMT>${input.closingBalance}<DTASOF>${at}</LEDGERBAL>`,
    '</STMTRS></STMTTRNRS></BANKMSGSRSV1>',
    '</OFX>',
  ].join(LINE_SEPARATOR);
}

function signOnBlock(at: string): string {
  return (
    `<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>` +
    `<DTSERVER>${at}<LANGUAGE>ENG<FI><ORG>${FINANCIAL_INSTITUTION}<FID>${BANK_ROUTING_ID}</FI>` +
    `</SONRS></SIGNONMSGSRSV1>`
  );
}

function transactionListBlock(input: OfxStatementInput): string {
  return [
    `<BANKTRANLIST><DTSTART>${toOfxTimestamp(input.from)}<DTEND>${toOfxTimestamp(input.to)}`,
    ...input.records.map((record) => transactionBlock(record)),
    '</BANKTRANLIST>',
  ].join(LINE_SEPARATOR);
}

function transactionBlock(record: TransactionRecord): string {
  const amount = fromStored(record.amount);
  const signed = record.direction === TransactionDirection.DEBIT ? amount.negate() : amount;

  return (
    `<STMTTRN><TRNTYPE>${ofxTypeOf(record.type, record.direction)}` +
    `<DTPOSTED>${toOfxTimestamp(record.bookedAt)}` +
    `<TRNAMT>${signed.toMajorString()}<FITID>${record.id}` +
    `<NAME>${escapeSgml(counterpartyOrDescription(record))}` +
    `<MEMO>${escapeSgml(memoOf(record))}</STMTTRN>`
  );
}

/**
 * The counterparty if there is one, the description otherwise.
 *
 * `<NAME>` is what an importer shows in its payee column and what it matches against
 * existing payee rules, so a merchant name belongs there and the bank's own narrative
 * only when there is nothing better.
 */
function counterpartyOrDescription(record: TransactionRecord): string {
  return record.counterparty?.name ?? record.description;
}

/** The memo carries the reference, the category, and the customer's own note. */
function memoOf(record: TransactionRecord): string {
  return [record.description, record.reference, record.category, record.notes]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/**
 * Reliance's entry types mapped onto the fixed OFX vocabulary.
 *
 * OFX has about a dozen transaction types and no extension point, so anything without a
 * faithful equivalent becomes the direction-appropriate `DEBIT`/`CREDIT`. Guessing a
 * closer-sounding tag would make an importer categorise the movement wrongly, which is
 * worse than leaving it unclassified for the customer's own rules to handle.
 */
function ofxTypeOf(type: EntryType, direction: TransactionDirection): string {
  const mapped = OFX_TYPE_BY_ENTRY_TYPE[type];
  if (mapped) return mapped;
  return direction === TransactionDirection.DEBIT ? 'DEBIT' : 'CREDIT';
}

const OFX_TYPE_BY_ENTRY_TYPE: Partial<Record<EntryType, string>> = {
  [EntryType.ATM_WITHDRAWAL]: 'ATM',
  [EntryType.CARD_PURCHASE]: 'POS',
  [EntryType.DIRECT_DEBIT]: 'DIRECTDEBIT',
  [EntryType.BILL_PAYMENT]: 'PAYMENT',
  [EntryType.INTERNAL_TRANSFER]: 'XFER',
  [EntryType.DOMESTIC_TRANSFER]: 'XFER',
  [EntryType.INTERNATIONAL_TRANSFER]: 'XFER',
  [EntryType.INBOUND_TRANSFER]: 'DIRECTDEP',
  [EntryType.FEE]: 'FEE',
  [EntryType.INTEREST_CREDIT]: 'INT',
  [EntryType.INTEREST_DEBIT]: 'INT',
  [EntryType.REVERSAL]: 'XFER',
};

/** `YYYYMMDDHHMMSS[0:GMT]` — UTC, stated explicitly so no importer has to guess. */
function toOfxTimestamp(at: Date): string {
  return `${at.toISOString().replaceAll(/[-:T]/g, '').slice(0, TIMESTAMP_LENGTH)}[0:GMT]`;
}

/**
 * SGML has no CDATA escape an OFX 1.x parser will honour, so the three structural
 * characters are entity-encoded and everything else is passed through.
 */
function escapeSgml(value: string): string {
  return value.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

const TIMESTAMP_LENGTH = 14;
const LINE_SEPARATOR = '\n';
const FINANCIAL_INSTITUTION = 'Reliance Bank';
const BANK_ROUTING_ID = '000000';

const OFX_HEADER = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  'VERSION:102',
  'SECURITY:NONE',
  'ENCODING:UTF-8',
  'CHARSET:NONE',
  'COMPRESSION:NONE',
  'OLDFILEUID:NONE',
  'NEWFILEUID:NONE',
  '',
].join(LINE_SEPARATOR);
