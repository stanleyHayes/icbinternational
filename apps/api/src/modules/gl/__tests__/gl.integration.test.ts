import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import { EntryType, ErrorCode, JournalEntryStatus, LedgerAccountType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { CHART_OF_ACCOUNTS, GL } from '../../../domain/ledger/chart-of-accounts.js';
import { JournalEntry } from '../../../domain/ledger/journal-entry.js';
import { Posting } from '../../../domain/ledger/posting.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_COLLECTION } from '../../ledger/ledger.constants.js';
import {
  JournalEntrySchema,
  type JournalEntrySchemaClass,
} from '../../ledger/schemas/journal-entry.schema.js';
import { GlAccountsService } from '../gl-accounts.service.js';
import { GlSeederService } from '../gl-seeder.service.js';
import { GlModule } from '../gl.module.js';
import { TrialBalanceService } from '../trial-balance.service.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_gl_test';
process.env.REDIS_URL ??= 'redis://localhost:6579';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(240_000);

const BOOKED_AT = new Date('2026-03-15T12:00:00.000Z');
const VALUE_DATE = '2026-03-15';
const JOURNAL_COLLECTION = 'journal_entries';
const gbp = (major: string) => Money.fromMajor(major, 'GBP');

function entry(
  reference: string,
  postings: Posting[],
  status: JournalEntryStatus = JournalEntryStatus.POSTED,
): Record<string, unknown> {
  const built = JournalEntry.create({
    reference,
    type: EntryType.MANUAL_ADJUSTMENT,
    description: `Integration fixture ${reference}`,
    valueDate: VALUE_DATE,
    bookedAt: BOOKED_AT,
    postings,
    status,
  });

  return {
    id: `jnl_${reference}`,
    reference: built.reference,
    type: built.type,
    status: built.status,
    description: built.description,
    valueDate: built.valueDate,
    bookedAt: built.bookedAt,
    postings: built.postings.map((posting) => ({
      ledgerAccountCode: posting.ledgerAccountCode,
      ledgerAccountName: posting.ledgerAccountName,
      accountId: posting.accountId,
      direction: posting.direction,
      amount: { amount: posting.amount.amount.toString(), currency: posting.currency },
      narrative: posting.narrative,
    })),
    reversesEntryId: null,
    reversedByEntryId: null,
    metadata: {},
  };
}

describe('GL module (integration, real Mongo replica set)', () => {
  let moduleRef: TestingModule;
  let connection: Connection;
  let journalEntries: Model<JournalEntrySchemaClass>;
  let seeder: GlSeederService;
  let trialBalances: TrialBalanceService;
  let accounts: GlAccountsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        ClockModule,
        DatabaseModule,
        GlModule,
        MongooseModule.forFeature([{ name: JOURNAL_ENTRY_MODEL, schema: JournalEntrySchema }]),
      ],
    }).compile();

    connection = moduleRef.get(getConnectionToken());
    journalEntries = moduleRef.get(getModelToken(JOURNAL_ENTRY_MODEL));
    seeder = moduleRef.get(GlSeederService);
    trialBalances = moduleRef.get(TrialBalanceService);
    accounts = moduleRef.get(GlAccountsService);

    await connection.dropCollection(LEDGER_ACCOUNT_COLLECTION).catch(() => undefined);
    await connection.dropCollection(JOURNAL_COLLECTION).catch(() => undefined);
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await moduleRef.close();
  });

  it('seeds the §3.2 chart, idempotently', async () => {
    const first = await seeder.seedChartOfAccounts();
    expect(first.created).toBe(CHART_OF_ACCOUNTS.length);
    expect(first.existing).toBe(0);

    const second = await seeder.seedChartOfAccounts();
    expect(second.created).toBe(0);
    expect(second.existing).toBe(CHART_OF_ACCOUNTS.length);

    const deposits = await accounts.getAccount(GL.CUSTOMER_DEPOSITS);
    expect(deposits.name).toBe('Customer Deposits');
    expect(deposits.type).toBe(LedgerAccountType.LIABILITY);
    expect(deposits.isControlAccount).toBe(true);
  });

  it('reports a zero trial balance on a freshly seeded chart', async () => {
    const report = await trialBalances.trialBalance('GBP');

    expect(report.balanced).toBe(true);
    expect(report.totalDebits).toEqual({ amount: '0', currency: 'GBP' });
    expect(report.totalCredits).toEqual({ amount: '0', currency: 'GBP' });
    expect(report.lines).toHaveLength(CHART_OF_ACCOUNTS.length);
  });

  it('sums to zero once balanced entries are posted, and ignores PENDING entries', async () => {
    await journalEntries.create([
      entry('int-1', [
        Posting.debit({
          ledgerAccountCode: GL.CASH_AT_CENTRAL_BANK,
          amount: gbp('10000.00'),
          narrative: 'Settlement in',
        }),
        Posting.credit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_integration_a',
          amount: gbp('10000.00'),
          narrative: 'Deposit',
        }),
      ]),
      entry('int-2', [
        Posting.debit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_integration_a',
          amount: gbp('25.00'),
          narrative: 'Fee charge',
        }),
        Posting.credit({
          ledgerAccountCode: GL.FEE_INCOME,
          amount: gbp('25.00'),
          narrative: 'Fee income',
        }),
      ]),
      entry(
        'int-pending',
        [
          Posting.debit({
            ledgerAccountCode: GL.SUSPENSE,
            amount: gbp('7.00'),
            narrative: 'Not booked yet',
          }),
          Posting.credit({
            ledgerAccountCode: GL.SUSPENSE,
            amount: gbp('7.00'),
            narrative: 'Not booked yet',
          }),
        ],
        JournalEntryStatus.PENDING,
      ),
    ]);

    const report = await trialBalances.trialBalance('GBP');

    expect(report.balanced).toBe(true);
    expect(report.difference.amount).toBe('0');
    expect(report.totalDebits).toEqual({ amount: '1002500', currency: 'GBP' });
    expect(report.totalCredits).toEqual(report.totalDebits);

    const line = (code: string) => report.lines.find((row) => row.code === code);
    expect(line(GL.CASH_AT_CENTRAL_BANK)?.debit.amount).toBe('1000000');
    expect(line(GL.CUSTOMER_DEPOSITS)?.credit.amount).toBe('1000000');
    expect(line(GL.CUSTOMER_DEPOSITS)?.debit.amount).toBe('2500');
    expect(line(GL.FEE_INCOME)?.credit.amount).toBe('2500');
    expect(line(GL.SUSPENSE)?.debit.amount).toBe('0');
  });

  it('nets a reversal pair to zero while the book stays balanced', async () => {
    const original = await journalEntries.findOne({ reference: 'int-2' }).exec();
    if (!original) throw new RangeError('fixture entry int-2 missing');

    await journalEntries.create(
      entry('int-2-reversal', [
        Posting.credit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_integration_a',
          amount: gbp('25.00'),
          narrative: 'Reversal — fee charge',
        }),
        Posting.debit({
          ledgerAccountCode: GL.FEE_INCOME,
          amount: gbp('25.00'),
          narrative: 'Reversal — fee income',
        }),
      ]),
    );
    await journalEntries
      .updateOne({ reference: 'int-2' }, { status: JournalEntryStatus.REVERSED })
      .exec();

    const report = await trialBalances.trialBalance('GBP');
    expect(report.balanced).toBe(true);
    expect(report.totalDebits).toEqual(report.totalCredits);

    const chart = await accounts.listAccounts();
    const feeIncome = chart.find((row) => row.code === GL.FEE_INCOME);
    expect(feeIncome?.balance.amount).toBe('0');
  });

  it('refuses to seed over a drifted chart row', async () => {
    await connection
      .collection(LEDGER_ACCOUNT_COLLECTION)
      .updateOne({ code: GL.NOSTRO_CLEARING }, { $set: { type: LedgerAccountType.LIABILITY } });

    let thrown: unknown;
    try {
      await seeder.seedChartOfAccounts();
    } catch (error) {
      thrown = error;
    } finally {
      await connection
        .collection(LEDGER_ACCOUNT_COLLECTION)
        .updateOne({ code: GL.NOSTRO_CLEARING }, { $set: { type: LedgerAccountType.ASSET } });
    }

    // Asserted after the restore so the chart is repaired even when this expectation
    // fails — a leaked drift row would cascade into every later test in the file.
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe(ErrorCode.PRECONDITION_FAILED);
  });
});
