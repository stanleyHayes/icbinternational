import { createConnection, type Connection } from 'mongoose';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { CHART_OF_ACCOUNTS } from '../../../domain/ledger/index.js';
import { ACCOUNT_MODEL } from '../../accounts/account.constants.js';
import { AccountRepository, AccountSchema, MongoAccountBalancePort } from '../../accounts/index.js';
import {
  BeneficiaryRepository,
  BeneficiarySchema,
  BENEFICIARY_MODEL,
} from '../../beneficiaries/index.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_MODEL } from '../../ledger/ledger.constants.js';
import { PostingService } from '../../ledger/posting.service.js';
import { JournalEntryRepository } from '../../ledger/repositories/journal-entry.repository.js';
import { LedgerAccountRepository } from '../../ledger/repositories/ledger-account.repository.js';
import { JournalEntrySchema } from '../../ledger/schemas/journal-entry.schema.js';
import { LedgerAccountSchema } from '../../ledger/schemas/ledger-account.schema.js';
import { QuoteRepository } from '../quote.repository.js';
import { TransferQuoteSchema } from '../quote.schema.js';
import { TRANSFER_MODEL, TRANSFER_QUOTE_MODEL } from '../transfer.constants.js';
import { TransferRepository } from '../transfer.repository.js';
import { TransferSchema } from '../transfer.schema.js';

/**
 * A real MongoDB replica set, wired to the repositories that need one.
 *
 * The in-memory stores reproduce every rule the Mongo ones enforce, which is why the rest
 * of the suite runs in seconds — but they cannot reproduce the thing that actually decides
 * a concurrent transfer: MongoDB's own conflict detection inside a snapshot-isolated
 * transaction. Only the server can prove that two simultaneous debits are serialised, so
 * the concurrency test talks to the server.
 *
 * Each rig gets its own database, dropped afterwards, so a failing run cannot poison the
 * next one and two suites cannot see each other's accounts.
 */
export interface MongoRig {
  connection: Connection;
  accounts: AccountRepository;
  transfers: TransferRepository;
  quotes: QuoteRepository;
  beneficiaries: BeneficiaryRepository;
  postings: PostingService;
  balancePort: MongoAccountBalancePort;
  clock: ClockService;
  runner: TransactionRunner;
  close: () => Promise<void>;
}

/**
 * Makes each rig's database name unique within a run.
 *
 * A counter rather than a timestamp: the wall clock is banned in this tree (the simulator
 * moves time), and two rigs built in the same millisecond would collide on a timestamp
 * anyway. The database is dropped on close, so uniqueness only has to hold within a run.
 */
let databaseSuffix = 0;
function nextDatabaseSuffix(): number {
  databaseSuffix += 1;
  return databaseSuffix;
}

/** Where the local replica set lives. Matches `infra/docker/docker-compose.yml`. */
const DEFAULT_URI = 'mongodb://localhost:27317/?replicaSet=rs0';

/** How long to wait for a connection before declaring the replica set absent. */
const CONNECT_TIMEOUT_MS = 3000;

/** Reports whether a replica set is reachable, so the suite can skip rather than fail. */
export async function replicaSetAvailable(): Promise<boolean> {
  const connection = createConnection(uri(), {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    dbName: 'reliance_probe',
  });

  try {
    await connection.asPromise();
    const hello = await connection.db?.admin().command({ hello: 1 });
    return typeof hello?.['setName'] === 'string';
  } catch {
    return false;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

/** Opens a connection to a throwaway database and wires the Mongo-backed collaborators. */
export async function mongoRig(name: string): Promise<MongoRig> {
  const connection = createConnection(uri(), {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    dbName: `reliance_test_${name}_${nextDatabaseSuffix()}`,
  });
  await connection.asPromise();

  const ids = new IdGenerator();
  const clock = new ClockService();
  clock.freezeAt(new Date('2026-03-01T09:00:00.000Z'));

  const models = registerModels(connection);
  const accounts = new AccountRepository(models.account);
  const balancePort = new MongoAccountBalancePort(accounts, clock);
  const runner = new TransactionRunner(connection);

  const glAccounts = new LedgerAccountRepository(models.ledgerAccount, ids);
  await seedChart(glAccounts);

  return {
    connection,
    accounts,
    balancePort,
    clock,
    runner,
    transfers: new TransferRepository(models.transfer, ids),
    quotes: new QuoteRepository(models.quote, ids),
    beneficiaries: new BeneficiaryRepository(models.beneficiary, ids),
    postings: new PostingService(
      new JournalEntryRepository(models.journalEntry, ids),
      glAccounts,
      balancePort,
      runner,
    ),
    close: async () => {
      await connection.dropDatabase();
      await connection.close();
    },
  };
}

/** Registers every schema this rig needs and builds their indexes before any test runs. */
function registerModels(connection: Connection) {
  return {
    account: connection.model(ACCOUNT_MODEL, AccountSchema),
    transfer: connection.model(TRANSFER_MODEL, TransferSchema),
    quote: connection.model(TRANSFER_QUOTE_MODEL, TransferQuoteSchema),
    beneficiary: connection.model(BENEFICIARY_MODEL, BeneficiarySchema),
    journalEntry: connection.model(JOURNAL_ENTRY_MODEL, JournalEntrySchema),
    ledgerAccount: connection.model(LEDGER_ACCOUNT_MODEL, LedgerAccountSchema),
  };
}

/**
 * Writes the chart of accounts.
 *
 * Sequential rather than `Promise.all`: the seed is two dozen rows and the ordering makes a
 * failure name the account it stopped on.
 */
async function seedChart(accounts: LedgerAccountRepository): Promise<void> {
  for (const entry of CHART_OF_ACCOUNTS) {
    await accounts.ensure({
      code: entry.code,
      name: entry.name,
      type: entry.type,
      isControlAccount: entry.isControlAccount,
    });
  }
}

function uri(): string {
  return process.env['MONGODB_TEST_URI'] ?? process.env['MONGODB_URI'] ?? DEFAULT_URI;
}
