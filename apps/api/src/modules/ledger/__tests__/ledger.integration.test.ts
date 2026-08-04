import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { CHART_OF_ACCOUNTS, GL, movementEntries } from '../../../domain/ledger/index.js';
import { LedgerVerifierService } from '../ledger-verifier.service.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_MODEL } from '../ledger.constants.js';
import { LedgerModule } from '../ledger.module.js';
import { AccountBalancePort } from '../ports/account-balance.port.js';
import { InMemoryAccountBalancePort } from '../ports/in-memory-account-balance.port.js';
import { PostingService } from '../posting.service.js';
import { JournalEntryStore } from '../repositories/journal-entry.store.js';
import { LedgerAccountStore } from '../repositories/ledger-account.store.js';
import { ReversalService } from '../reversal.service.js';
import { type JournalEntrySchemaClass } from '../schemas/journal-entry.schema.js';
import { type LedgerAccountSchemaClass } from '../schemas/ledger-account.schema.js';
import { applyLedgerValidators } from '../schemas/ledger-validators.js';
import { LedgerRepairService } from '../verification/ledger-repair.service.js';

import {
  fundingEntry,
  testAccountId,
  TEST_BOOKED_AT,
  TEST_VALUE_DATE,
} from './ledger-test.helpers.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_ledger_it';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6579';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(300_000);

const GBP = 'GBP';

/**
 * Full-stack tests against the real replica set: Mongoose models, the `$jsonSchema`
 * validators, real multi-document transactions and the real unique indexes.
 *
 * The customer balance side runs against the in-memory port — the Mongo-backed adapter
 * belongs to the accounts module (B-04) — which is exactly the runtime wiring
 * `LedgerModule` ships until then.
 */
describe('LedgerModule (integration)', () => {
  let moduleRef: TestingModule;
  let posting: PostingService;
  let reversals: ReversalService;
  let verifier: LedgerVerifierService;
  let repair: LedgerRepairService;
  let entries: JournalEntryStore;
  let glAccounts: LedgerAccountStore;
  let balances: InMemoryAccountBalancePort;
  let entryModel: Model<JournalEntrySchemaClass>;
  let glModel: Model<LedgerAccountSchemaClass>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ClockModule, DatabaseModule, LedgerModule],
    })
      // These tests exercise the journal and the GL, not customer-balance persistence, and
      // they drive the port's `open()` helper directly. `LedgerModule` binds the Mongo
      // adapter now — one binding application-wide, so the in-memory one is asked for here
      // rather than being the default everything silently inherited.
      .overrideProvider(AccountBalancePort)
      .useClass(InMemoryAccountBalancePort)
      .compile();

    entryModel = moduleRef.get(getModelToken(JOURNAL_ENTRY_MODEL));
    glModel = moduleRef.get(getModelToken(LEDGER_ACCOUNT_MODEL));

    // Reset to a known state, then restore what the drop removed: the module's validator
    // sync ran at compile time, before the collections existed to be dropped.
    const connection = moduleRef.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await applyLedgerValidators(connection);
    await entryModel.syncIndexes();
    await glModel.syncIndexes();

    posting = moduleRef.get(PostingService);
    reversals = moduleRef.get(ReversalService);
    verifier = moduleRef.get(LedgerVerifierService);
    repair = moduleRef.get(LedgerRepairService);
    entries = moduleRef.get(JournalEntryStore);
    glAccounts = moduleRef.get(LedgerAccountStore);
    balances = moduleRef.get(AccountBalancePort) as InMemoryAccountBalancePort;

    for (const entry of CHART_OF_ACCOUNTS) {
      await glAccounts.ensure(entry);
    }
  });

  afterAll(async () => {
    const connection = moduleRef.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await moduleRef.close();
  });

  it('posts an entry end to end and verifies a clean book', async () => {
    const accountId = testAccountId('IT-1');
    balances.open({ accountId, opening: Money.zero(GBP) });

    const record = await posting.post(
      fundingEntry({ reference: 'IT-1', accountId, amount: Money.fromMinor(2500, GBP) }),
    );

    expect(record.id).toMatch(/^jnl_/);

    const deposits = await glAccounts.findByCode(GL.CUSTOMER_DEPOSITS);
    expect(deposits?.balances[GBP]?.amount).toBe('2500');

    const report = await verifier.verify();
    expect(report.healthy).toBe(true);
    expect(report.entriesScanned).toBe(1);
  });

  it('books a reference exactly once under concurrent duplicate posts', async () => {
    const accountId = testAccountId('IT-RACE');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const entry = fundingEntry({
      reference: 'IT-RACE',
      accountId,
      amount: Money.fromMinor(1000, GBP),
    });

    const results = await Promise.all(Array.from({ length: 10 }, () => posting.post(entry)));

    expect(new Set(results.map((record) => record.id)).size).toBe(1);
    expect(await entries.scanFrom({ limit: 100 })).toHaveLength(2); // this + previous test
    expect(balances.balanceOf(accountId).amount).toBe(1000n);
  });

  it('pages an account feed with a stable cursor', async () => {
    const accountId = testAccountId('IT-PAGE');
    balances.open({ accountId, opening: Money.zero(GBP) });

    for (let index = 0; index < 5; index += 1) {
      await posting.post(
        movementEntries.simulatedFunding({
          reference: `IT-PAGE-${index}`,
          accountId,
          amount: Money.fromMinor(100, GBP),
          description: 'page probe',
          valueDate: TEST_VALUE_DATE,
          bookedAt: new Date(TEST_BOOKED_AT.getTime() + index * 1000),
        }),
      );
    }

    const first = await entries.findByAccount({ accountId, limit: 2 });
    const second = await entries.findByAccount({
      accountId,
      limit: 2,
      cursor: first.page.cursor ?? undefined,
    });
    const third = await entries.findByAccount({
      accountId,
      limit: 2,
      cursor: second.page.cursor ?? undefined,
    });

    const ids = [...first.data, ...second.data, ...third.data].map((record) => record.reference);
    expect(new Set(ids).size).toBe(5);
    expect(first.page.hasMore).toBe(true);
    expect(third.page.hasMore).toBe(false);
    // Newest first.
    expect(first.data[0]?.reference).toBe('IT-PAGE-4');
  });

  it('reverses an entry and returns balances to their start', async () => {
    const accountId = testAccountId('IT-REV');
    balances.open({ accountId, opening: Money.zero(GBP) });
    const original = await posting.post(
      fundingEntry({ reference: 'IT-REV', accountId, amount: Money.fromMinor(700, GBP) }),
    );

    const reversal = await reversals.reverse({ entryId: original.id, reason: 'customer dispute' });

    expect(reversal.reversesEntryId).toBe(original.id);
    const marked = await entries.findByPublicId(original.id);
    expect(marked?.status).toBe('REVERSED');
    expect(balances.balanceOf(accountId).amount).toBe(0n);

    const report = await verifier.verify();
    expect(report.healthy).toBe(true);
  });

  it('detects injected GL drift and repairs it from the postings', async () => {
    await glModel.updateOne(
      { code: GL.NOSTRO_CLEARING },
      { $set: { 'balances.GBP': { amount: '999999', currency: GBP } } },
    );

    const drifted = await verifier.verify();
    expect(drifted.healthy).toBe(false);
    expect(drifted.ledgerAccountDrift.some((d) => d.target === GL.NOSTRO_CLEARING)).toBe(true);

    const repaired = await repair.verifyAndRepair();
    expect(repaired.healthy).toBe(true);

    const nostro = await glAccounts.findByCode(GL.NOSTRO_CLEARING);
    expect(nostro?.balances[GBP]?.amount).not.toBe('999999');
  });

  it('flags an unbalanced entry written around the application', async () => {
    await entryModel.collection.insertOne({
      id: 'jnl_TAMPEREDINTEGRATION0000',
      reference: 'IT-TAMPERED',
      type: 'MANUAL_ADJUSTMENT',
      status: 'POSTED',
      description: 'bad migration',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
      postings: [
        {
          ledgerAccountCode: GL.NOSTRO_CLEARING,
          ledgerAccountName: 'Nostro / External Clearing',
          accountId: null,
          direction: 'DEBIT',
          amount: { amount: '100', currency: GBP },
          narrative: 'in',
        },
        {
          ledgerAccountCode: GL.UNSETTLED_INBOUND,
          ledgerAccountName: 'Unsettled Inbound Payments',
          accountId: null,
          direction: 'CREDIT',
          amount: { amount: '99', currency: GBP },
          narrative: 'out',
        },
      ],
      reversesEntryId: null,
      reversedByEntryId: null,
      metadata: {},
    });

    const report = await verifier.verify();
    expect(report.healthy).toBe(false);
    expect(report.unbalancedEntries.map((finding) => finding.reference)).toContain('IT-TAMPERED');

    // Clean up so the suite ends on a healthy book.
    await entryModel.collection.deleteOne({ reference: 'IT-TAMPERED' });
    const after = await repair.verifyAndRepair();
    expect(after.healthy).toBe(true);
  });

  it('rejects a single-legged write at every layer', async () => {
    const oneLegged: JournalEntrySchemaClass = {
      reference: 'IT-ONE-LEG',
      type: 'MANUAL_ADJUSTMENT',
      status: 'POSTED',
      description: 'not double-entry',
      valueDate: TEST_VALUE_DATE,
      bookedAt: TEST_BOOKED_AT,
      postings: [
        {
          ledgerAccountCode: GL.NOSTRO_CLEARING,
          ledgerAccountName: 'Nostro / External Clearing',
          accountId: null,
          direction: 'DEBIT',
          amount: { amount: '100', currency: GBP },
          narrative: 'only leg',
        },
      ],
      reversesEntryId: null,
      reversedByEntryId: null,
      metadata: {},
      id: 'jnl_ONELEG0000000000000001',
    };

    // Mongoose hook.
    await expect(entryModel.create([oneLegged])).rejects.toThrow(/at least 2 postings/);

    // Server-side `$jsonSchema` validator (bypassing Mongoose entirely).
    await expect(
      entryModel.collection.insertOne({ ...oneLegged, id: 'jnl_ONELEG0000000000000002' }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
