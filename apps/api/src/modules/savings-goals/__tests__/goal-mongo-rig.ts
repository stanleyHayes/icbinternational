import { createConnection, type Connection } from 'mongoose';

import { AccountStatus, AccountType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { CHART_OF_ACCOUNTS } from '../../../domain/ledger/index.js';
import { ACCOUNT_MODEL } from '../../accounts/account.constants.js';
import {
  AccountNumberService,
  AccountRepository,
  AccountSchema,
  MongoAccountBalancePort,
} from '../../accounts/index.js';
import { BalanceService } from '../../holds/index.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_MODEL } from '../../ledger/ledger.constants.js';
import { PostingService } from '../../ledger/posting.service.js';
import { JournalEntryRepository } from '../../ledger/repositories/journal-entry.repository.js';
import { LedgerAccountRepository } from '../../ledger/repositories/ledger-account.repository.js';
import { JournalEntrySchema } from '../../ledger/schemas/journal-entry.schema.js';
import { LedgerAccountSchema } from '../../ledger/schemas/ledger-account.schema.js';
import { GOAL_MODEL } from '../goal.constants.js';
import { GoalRepository } from '../goal.repository.js';
import { GoalSchema } from '../goal.schema.js';

/**
 * A real MongoDB replica set, wired to the savings collaborators that need one.
 *
 * Mirrors `modules/transfers/__tests__/mongo-rig.ts`, for the same reason: the in-memory
 * stores reproduce every rule, but not the one thing that decides whether two simultaneous
 * vault movements are safe — MongoDB's own conflict detection inside a snapshot-isolated
 * transaction. Only the server can prove that a conditional balance write serialises two
 * withdrawals, so the concurrency suite talks to the server.
 *
 * Each rig gets its own database, dropped afterwards, so a failing run cannot poison the
 * next one and two suites cannot see each other's goals.
 */
export interface GoalRig {
  connection: Connection;
  accounts: AccountRepository;
  goals: GoalRepository;
  postings: PostingService;
  balances: BalanceService;
  clock: ClockService;
  runner: TransactionRunner;
  close: () => Promise<void>;
}

/** Where the local replica set lives. Matches `infra/docker/docker-compose.yml`. */
const DEFAULT_URI = 'mongodb://localhost:27317/?replicaSet=rs0';

/** How long to wait for a connection before declaring the replica set absent. */
const CONNECT_TIMEOUT_MS = 3000;

/**
 * Makes each rig's database name unique within a run.
 *
 * A counter rather than a timestamp: the wall clock is banned in this tree, and two rigs
 * built in the same millisecond would collide on one anyway.
 */
let databaseSuffix = 0;

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
export async function goalRig(): Promise<GoalRig> {
  databaseSuffix += 1;
  const connection = createConnection(uri(), {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    dbName: `reliance_test_goals_${databaseSuffix}`,
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
    clock,
    runner,
    goals: new GoalRepository(models.goal, ids),
    balances: new BalanceService(accounts, clock),
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
    goal: connection.model(GOAL_MODEL, GoalSchema),
    journalEntry: connection.model(JOURNAL_ENTRY_MODEL, JournalEntrySchema),
    ledgerAccount: connection.model(LEDGER_ACCOUNT_MODEL, LedgerAccountSchema),
  };
}

/** Writes the chart of accounts, sequentially so a failure names the account it stopped on. */
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

const ids = new IdGenerator();
let serial = 40_000_000;

/**
 * A funded current account, minted with real Reliance identifiers.
 *
 * `heldMinor` reserves part of the balance, exactly as a live card authorisation would.
 * Money that is held is still on the ledger, so it is invisible to the ledger's overdraw
 * floor and visible only to a caller that asks `BalanceService` what is spendable.
 */
export async function openAccount(
  rig: GoalRig,
  input: { userId: string; minor: string; heldMinor?: string },
): Promise<string> {
  serial += 1;
  const identifiers = new AccountNumberService(rig.accounts, {
    countryCode: 'GB',
    bankCode: 'RLNC',
    sortCode: '049921',
  }).identifiersFor(String(serial).padStart(8, '0'));

  const zero = toStored(Money.zero('GBP'));
  const ledger = Money.fromMinor(input.minor, 'GBP');
  const held = Money.fromMinor(input.heldMinor ?? '0', 'GBP');

  const result = await rig.accounts.insert({
    id: ids.generate('account'),
    userId: input.userId,
    holderIds: [input.userId],
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency: 'GBP',
    productCode: 'EVERYDAY_CURRENT',
    productVersion: 1,
    productName: 'Everyday Current',
    nickname: null,
    number: identifiers.number,
    sortCode: identifiers.sortCode,
    iban: identifiers.iban,
    ledgerBalance: toStored(ledger),
    // The stored figure is exactly `ledger − holdTotal`; the facility is added at read time.
    availableBalance: toStored(ledger.minus(held)),
    holdTotal: toStored(held),
    overdraftLimit: zero,
    minimumOpeningBalance: zero,
    interestRateBps: null,
    isPrimary: true,
    openedAt: rig.clock.now(),
  });

  if (!result.account) throw new Error(`Fixture account collided on ${result.conflictOn}`);
  return result.account.id;
}

function uri(): string {
  return process.env['MONGODB_TEST_URI'] ?? process.env['MONGODB_URI'] ?? DEFAULT_URI;
}
