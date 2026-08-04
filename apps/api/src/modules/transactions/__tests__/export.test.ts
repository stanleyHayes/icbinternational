import { ExportFormat, TransactionDirection } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { CSV_COLUMNS, escapeCsvField, toCsv } from '../export/csv.exporter.js';
import { toOfx } from '../export/ofx.exporter.js';
import { renderReceipt } from '../export/receipt.renderer.js';
import { InMemoryTransactionStore } from '../repositories/in-memory-transaction.store.js';
import { type TransactionRecord } from '../repositories/transaction.store.js';
import { TransactionExportService } from '../transaction-export.service.js';
import { TransactionRangeReader } from '../transaction-range.reader.js';

import { ACCOUNT_ID, row, seedRows, USER_ID } from './transaction-test.helpers.js';

const FROM = '2026-03-01T00:00:00.000Z';
const TO = '2026-03-31T23:59:59.000Z';

/**
 * A minimal RFC 4180 reader, for the round-trip assertion only.
 *
 * Deliberately test-side: a parser in `src` that nothing calls would be dead code. What
 * this proves is that the writer emits a well-formed document — quoting, escaping and
 * embedded separators all survive a reader that knows only the standard.
 */
function parseCsv(text: string): string[][] {
  const body = text.endsWith(ROW_SEPARATOR) ? text.slice(0, -ROW_SEPARATOR.length) : text;

  return splitUnquoted(body, ROW_SEPARATOR).map((line) =>
    splitUnquoted(line, FIELD_SEPARATOR).map((field) => unquoteCsvField(field)),
  );
}

/**
 * Splits on separators that are not inside a quoted field.
 *
 * A single linear pass with a quote toggle. An escaped `""` toggles twice and so leaves
 * the state unchanged, which is exactly right — and a regex-based scanner for the same
 * grammar backtracks super-linearly on a long quoted field.
 */
function splitUnquoted(text: string, separator: string): string[] {
  const parts: string[] = [];
  let inQuotes = false;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') inQuotes = !inQuotes;
    else if (!inQuotes && text.startsWith(separator, index)) {
      parts.push(text.slice(start, index));
      index += separator.length - 1;
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function unquoteCsvField(field: string): string {
  if (!field.startsWith('"')) return field;
  return field.slice(1, -1).split('""').join('"');
}

const ROW_SEPARATOR = '\r\n';
const FIELD_SEPARATOR = ',';

function build(): { store: InMemoryTransactionStore; service: TransactionExportService } {
  const store = new InMemoryTransactionStore();
  return { store, service: new TransactionExportService(new TransactionRangeReader(store)) };
}

async function record(store: InMemoryTransactionStore): Promise<TransactionRecord> {
  return store.insert(row());
}

describe('CSV export', () => {
  it('round-trips every column back to the value it came from', async () => {
    const { store } = build();
    const inserted = await store.insert(
      row({
        description: 'Coffee, "the good one"\r\nand a pastry',
        reference: 'REF-42',
      }),
    );
    // Notes are a customer annotation applied after the fact — the projector never sets
    // them at insert, which is why `NewTransaction` omits the field. Add it the way the
    // product does, so the export is exercised against a realistic record.
    const original = await store.patch({
      id: inserted.id,
      userId: inserted.userId,
      notes: 'Client meeting',
    });
    if (!original) throw new Error('patch did not return the updated record');

    const parsed = parseCsv(toCsv([original]));
    const [header, body] = parsed;

    expect(header).toEqual(CSV_COLUMNS.map((column) => column.header));
    expect(body).toEqual(CSV_COLUMNS.map((column) => column.value(original)));
  });

  it('writes a signed major-unit amount a spreadsheet can total', async () => {
    const { store } = build();
    const debit = await store.insert(row({ journalEntryId: 'jnl_d' }));
    const credit = await store.insert(
      row({ journalEntryId: 'jnl_c', direction: TransactionDirection.CREDIT }),
    );

    const [, debitRow, creditRow] = parseCsv(toCsv([debit, credit]));
    const amountColumn = CSV_COLUMNS.findIndex((column) => column.header === 'Amount');

    expect(debitRow?.[amountColumn]).toBe('-12.50');
    expect(creditRow?.[amountColumn]).toBe('12.50');
  });

  it('quotes only the fields that need it', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('has,comma')).toBe('"has,comma"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('emits a header even when the range is empty', () => {
    const parsed = parseCsv(toCsv([]));
    expect(parsed).toHaveLength(1);
  });
});

describe('OFX export', () => {
  it('produces a parseable OFX 1.x statement with UTC timestamps', async () => {
    const { store } = build();
    const only = await record(store);

    const ofx = toOfx({
      accountId: ACCOUNT_ID,
      records: [only],
      currency: 'GBP',
      closingBalance: '987.50',
      generatedAt: new Date(TO),
      from: new Date(FROM),
      to: new Date(TO),
    });

    expect(ofx).toContain('OFXHEADER:100');
    expect(ofx).toContain('<CURDEF>GBP');
    expect(ofx).toContain('<TRNTYPE>POS');
    expect(ofx).toContain('<TRNAMT>-12.50');
    expect(ofx).toContain(`<FITID>${only.id}`);
    expect(ofx).toMatch(/<DTPOSTED>\d{14}\[0:GMT]/);
  });

  it('entity-encodes a narrative that would otherwise break the SGML', async () => {
    const { store } = build();
    const awkward = await store.insert(row({ description: 'Smith & Sons <Ltd>' }));

    const ofx = toOfx({
      accountId: ACCOUNT_ID,
      records: [awkward],
      currency: 'GBP',
      closingBalance: '0.00',
      generatedAt: new Date(TO),
      from: new Date(FROM),
      to: new Date(TO),
    });

    expect(ofx).toContain('Smith &amp; Sons &lt;Ltd&gt;');
    expect(ofx).not.toContain('<Ltd>');
  });
});

describe('TransactionExportService', () => {
  const query = (format: ExportFormat) => ({
    accountId: ACCOUNT_ID,
    format,
    from: FROM,
    to: TO,
  });

  it('names the file after the account and the range', async () => {
    const { store, service } = build();
    await seedRows(store, 2);

    const exported = await service.export(USER_ID, query(ExportFormat.CSV));

    expect(exported.filename).toBe(`${ACCOUNT_ID}_2026-03-01_2026-03-31.csv`);
    expect(exported.contentType).toContain('text/csv');
  });

  it('exports JSON in the contract shape', async () => {
    const { store, service } = build();
    await record(store);

    const exported = await service.export(USER_ID, query(ExportFormat.JSON));
    const payload: unknown = JSON.parse(exported.body.toString('utf8'));

    expect(payload).toHaveProperty('data');
  });

  it('returns an empty file for an account the caller does not own', async () => {
    const { store, service } = build();
    await store.insert(row({ userId: 'usr_01JQ8Z00000000000000000009' }));

    const exported = await service.export(USER_ID, query(ExportFormat.CSV));
    expect(parseCsv(exported.body.toString('utf8'))).toHaveLength(1);
  });

  it('refuses PDF rather than producing a lookalike statement', async () => {
    const { service } = build();

    await expect(service.export(USER_ID, query(ExportFormat.PDF))).rejects.toBeInstanceOf(AppError);
  });
});

describe('receipt', () => {
  it('renders the ledger reference so the row can be traced', async () => {
    const { store } = build();
    const only = await record(store);

    const receipt = renderReceipt(only);

    expect(receipt).toContain('RELIANCE BANK');
    expect(receipt).toContain(only.journalEntryId);
    expect(receipt).toContain(only.id);
  });
});
