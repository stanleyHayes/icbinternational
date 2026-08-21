import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { CHART_OF_ACCOUNTS, GL } from '../../../domain/ledger/index.js';
import { LedgerVerifierService } from '../ledger-verifier.service.js';
import { JOURNAL_ENTRY_MODEL } from '../ledger.constants.js';
import { LedgerModule } from '../ledger.module.js';
import { AccountBalancePort } from '../ports/account-balance.port.js';
import { InMemoryAccountBalancePort } from '../ports/in-memory-account-balance.port.js';
import { LedgerAccountStore } from '../repositories/ledger-account.store.js';
import { type JournalEntrySchemaClass } from '../schemas/journal-entry.schema.js';
import { LedgerReplay } from '../verification/ledger-replay.js';

import { testAccountId } from './ledger-test.helpers.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_ledger_scale';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(900_000);

const ENTRY_COUNT = 10_000;
const INSERT_CHUNK = 2_000;
const ACCOUNT_COUNT = 200;
const BASE_TIME = Date.UTC(2025, 0, 1);
const GL_POSTED = [GL.NOSTRO_CLEARING, GL.CUSTOMER_DEPOSITS] as const;

/**
 * The B-02 acceptance bar: replay ten thousand entries and match every balance.
 *
 * Entries are written in bulk straight to the collection — the write path under test is
 * the *verifier's*, not the posting service's, and 10k serial transactions would measure
 * the network, not the logic. Projections are then set to the replay's own output, which
 * is exactly the state `PostingService` would have produced, and the verifier must
 * confirm the book is healthy.
 */
describe('LedgerVerifierService at scale (integration)', () => {
  let moduleRef: TestingModule;
  let verifier: LedgerVerifierService;
  let balances: InMemoryAccountBalancePort;
  let entryModel: Model<JournalEntrySchemaClass>;
  let connection: Connection;

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

    verifier = moduleRef.get(LedgerVerifierService);
    balances = moduleRef.get(AccountBalancePort) as InMemoryAccountBalancePort;
    entryModel = moduleRef.get(getModelToken(JOURNAL_ENTRY_MODEL));

    connection = moduleRef.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await entryModel.syncIndexes();

    const glAccounts = moduleRef.get(LedgerAccountStore);
    for (const entry of CHART_OF_ACCOUNTS) await glAccounts.ensure(entry);

    await populate();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await moduleRef.close();
  });

  it('rebuilds 10k entries and matches every balance', async () => {
    const report = await verifier.verify();

    expect(report.entriesScanned).toBe(ENTRY_COUNT);
    expect(report.healthy).toBe(true);
    expect(report.unbalancedEntries).toHaveLength(0);
    expect(report.ledgerAccountDrift).toHaveLength(0);
    expect(report.customerAccountDrift).toHaveLength(0);
    expect(report.trialBalance.every((line) => line.balanced)).toBe(true);
    expect(report.controlTotals.every((line) => line.matched)).toBe(true);
  });

  /**
   * Inserts 10k deterministic entries, then writes the projections the posting service
   * would have produced, computed with the same replay the verifier uses.
   */
  async function populate(): Promise<void> {
    const replay = new LedgerReplay();
    const random = lcg(42);

    for (let offset = 0; offset < ENTRY_COUNT; offset += INSERT_CHUNK) {
      const docs = Array.from({ length: INSERT_CHUNK }, (_, index) =>
        buildEntry(offset + index, random),
      );
      await entryModel.collection.insertMany(docs, { ordered: true });
      for (const doc of docs) replay.add(doc);
    }

    await writeGlProjection(replay);
    writeCustomerProjection(replay);
  }

  async function writeGlProjection(replay: LedgerReplay): Promise<void> {
    const chartOfAccounts = connection.collection('chart_of_accounts');
    for (const balance of replay.ledgerBalances()) {
      await chartOfAccounts.updateOne(
        { code: balance.target },
        {
          $set: {
            [`balances.${balance.currency}`]: {
              amount: balance.balance.amount.toString(),
              currency: balance.currency,
            },
          },
        },
      );
    }
  }

  function writeCustomerProjection(replay: LedgerReplay): void {
    for (const balance of replay.customerBalances()) {
      balances.open({
        accountId: balance.target,
        opening: Money.zero(balance.balance.currency),
      });
      balances.injectDrift(balance.target, balance.balance);
    }
  }
});

/** One funding entry: debit nostro, credit the customer. Deterministic per index. */
function buildEntry(index: number, random: () => number): JournalEntrySchemaClass {
  const accountId = testAccountId(`S${index % ACCOUNT_COUNT}`);
  const amount = 100 + Math.floor(random() * 9_900);
  const bookedAt = new Date(BASE_TIME + index * 1000);

  return {
    id: `jnl_SCALE${String(index).padStart(20, '0')}`.slice(0, 30),
    reference: `SCALE-${index}`,
    type: 'INBOUND_TRANSFER',
    status: 'POSTED',
    description: 'scale fixture',
    valueDate: '2025-01-01',
    bookedAt,
    postings: [
      {
        ledgerAccountCode: GL_POSTED[0],
        ledgerAccountName: 'Nostro / External Clearing',
        accountId: null,
        direction: 'DEBIT',
        amount: { amount: String(amount), currency: 'GBP' },
        narrative: 'scale in',
      },
      {
        ledgerAccountCode: GL_POSTED[1],
        ledgerAccountName: 'Customer Deposits',
        accountId,
        direction: 'CREDIT',
        amount: { amount: String(amount), currency: 'GBP' },
        narrative: 'scale credit',
      },
    ],
    reversesEntryId: null,
    reversedByEntryId: null,
    metadata: {},
  } as JournalEntrySchemaClass;
}

/** A tiny deterministic generator — fixtures must be reproducible, not random. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}
