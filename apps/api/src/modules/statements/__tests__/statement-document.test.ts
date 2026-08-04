import { StatementFormat, TransactionDirection } from '@reliance/contracts';

import { type AppConfigService } from '../../../config/config.service.js';
import { StatementDocumentService } from '../statement-document.service.js';
import { monthlyPeriod } from '../statement-period.js';

import { account, buildHarness, row, type StatementsHarness } from './statements-harness.js';

const BANK = 'Reliance Bank';
const config = { bank: { name: BANK } } as unknown as AppConfigService;
const december = monthlyPeriod(2025, 11);

/** The four bytes every PDF reader looks for before it will open a file. */
const PDF_MAGIC = '%PDF';

describe('StatementDocumentService', () => {
  let harness: StatementsHarness;
  let documents: StatementDocumentService;

  beforeEach(async () => {
    harness = buildHarness();
    documents = new StatementDocumentService(harness.builder, config);

    await harness.store.insert(
      row({
        minorUnits: 50_000,
        runningBalanceMinor: 50_000,
        bookedAt: '2025-12-03T10:00:00.000Z',
        direction: TransactionDirection.CREDIT,
      }),
    );
    await harness.store.insert(
      row({
        minorUnits: 12_000,
        runningBalanceMinor: 38_000,
        bookedAt: '2025-12-20T10:00:00.000Z',
      }),
    );
  });

  it('renders a PDF a reader will open', async () => {
    const rendered = await documents.render({
      account: account(),
      period: december,
      format: StatementFormat.PDF,
    });

    expect(rendered.contentType).toBe('application/pdf');
    expect(rendered.body.subarray(0, PDF_MAGIC.length).toString('utf8')).toBe(PDF_MAGIC);
    expect(rendered.filename).toBe('statement_20461377_2025-12-01_2025-12-31.pdf');
  });

  it('renders the same bytes for the same statement twice', async () => {
    const first = await documents.render({
      account: account(),
      period: december,
      format: StatementFormat.PDF,
    });
    const second = await documents.render({
      account: account(),
      period: december,
      format: StatementFormat.PDF,
    });

    expect(first.body.byteLength).toBe(second.body.byteLength);
  });

  it('renders CSV through the exporter the transaction feed already uses', async () => {
    const rendered = await documents.render({
      account: account(),
      period: december,
      format: StatementFormat.CSV,
    });

    const lines = rendered.body.toString('utf8').trim().split('\n');
    expect(lines[0]).toContain('Date');
    expect(lines).toHaveLength(3);
  });

  it('declares the statement closing balance in OFX, not the last row', async () => {
    const rendered = await documents.render({
      account: account(),
      period: monthlyPeriod(2026, 0),
      format: StatementFormat.OFX,
    });

    const body = rendered.body.toString('utf8');
    expect(body).toContain('<CURDEF>GBP');
    // January has no rows; the balance carried in from December still has to be declared.
    expect(body).toContain('<BALAMT>380.00');
  });
});
