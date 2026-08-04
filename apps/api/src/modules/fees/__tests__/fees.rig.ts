import { createConnection, type Connection, type Model } from 'mongoose';

import { AccountStatus, AccountType, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { CHART_OF_ACCOUNTS } from '../../../domain/ledger/index.js';
import {
  ACCOUNT_MODEL,
  AccountNumberService,
  AccountRepository,
  AccountSchema,
  MongoAccountBalancePort,
  type AccountSchemaClass,
} from '../../accounts/index.js';
import { JOURNAL_ENTRY_MODEL, LEDGER_ACCOUNT_MODEL } from '../../ledger/ledger.constants.js';
import { PostingService } from '../../ledger/posting.service.js';
import { JournalEntryRepository } from '../../ledger/repositories/journal-entry.repository.js';
import { LedgerAccountRepository } from '../../ledger/repositories/ledger-account.repository.js';
import {
  JournalEntrySchema,
  type JournalEntrySchemaClass,
} from '../../ledger/schemas/journal-entry.schema.js';
import {
  LedgerAccountSchema,
  type LedgerAccountSchemaClass,
} from '../../ledger/schemas/ledger-account.schema.js';
import { FeeService as ProductFeeService, ProductService } from '../../products/index.js';
import { ProductRepository } from '../../products/product.repository.js';
import { ProductSchema, ProductSchemaClass } from '../../products/product.schema.js';
import { UsageCounterRepository } from '../../products/usage-counter.repository.js';
import {
  UsageCounterSchema,
  UsageCounterSchemaClass,
} from '../../products/usage-counter.schema.js';
import { CategorisationService } from '../../transactions/categorisation.service.js';
import { InMemoryAccountOwnerPort } from '../../transactions/ports/in-memory-account-owner.port.js';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository.js';
import {
  TransactionSchema,
  type TransactionSchemaClass,
} from '../../transactions/schemas/transaction.schema.js';
import { TransactionProjectorService } from '../../transactions/transaction-projector.service.js';
import { TRANSACTION_MODEL } from '../../transactions/transactions.constants.js';
import { ChargeableAccountReader } from '../chargeable-account.reader.js';
import {
  ChargeableAccountSchema,
  type ChargeableAccountSchemaClass,
} from '../chargeable-account.schema.js';
import { CustomerTierPort } from '../customer-tier.port.js';
import { FeeChargeRepository } from '../fee-charge.repository.js';
import { FeeChargeSchema, type FeeChargeSchemaClass } from '../fee-charge.schema.js';
import { FeeChargingService } from '../fee-charging.service.js';
import { FeeIncomeReader } from '../fee-income.reader.js';
import { FeeJournalReadSchema, type JournalEntryLine } from '../fee-journal-read.schema.js';
import { FeePostingService } from '../fee-posting.service.js';
import { FeeReconciliationService } from '../fee-reconciliation.service.js';
import {
  CHARGEABLE_ACCOUNT_MODEL,
  FEE_CHARGE_MODEL,
  FEE_JOURNAL_READ_MODEL,
} from '../fees.constants.js';
import { MaintenanceFeeService } from '../maintenance-fee.service.js';

/**
 * A real MongoDB replica set, wired to the fees engine's collaborators by hand.
 *
 * The same pattern as the transfers rig: the services Nest would inject, built directly,
 * so the suite needs no AuthModule, no config environment and no Redis — only the server
 * whose transaction semantics are the thing under test.
 */

export const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27317/?replicaSet=rs0';
export const CONNECT_TIMEOUT_MS = 3000;

export interface RigModels {
  account: Model<AccountSchemaClass>;
  journalEntry: Model<JournalEntrySchemaClass>;
  ledgerAccount: Model<LedgerAccountSchemaClass>;
  product: Model<ProductSchemaClass>;
  usageCounter: Model<UsageCounterSchemaClass>;
  feeCharge: Model<FeeChargeSchemaClass>;
  chargeable: Model<ChargeableAccountSchemaClass>;
  journalRead: Model<JournalEntryLine>;
  transaction: Model<TransactionSchemaClass>;
}

/** A tier port with a fixed answer, so the waiver cases need no account plumbing. */
export class StaticTierPort extends CustomerTierPort {
  constructor(private readonly tier: string | null) {
    super();
  }

  override async tierFor(): Promise<string | null> {
    return this.tier;
  }
}

/** Reports whether a replica set is reachable, so the suite can skip rather than fail. */
export async function replicaSetAvailable(): Promise<boolean> {
  const probe = createConnection(MONGO_URI, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    dbName: 'reliance_probe',
  });

  try {
    await probe.asPromise();
    const hello = await probe.db?.admin().command({ hello: 1 });
    return typeof hello?.['setName'] === 'string';
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => undefined);
  }
}

export function registerModels(connection: Connection): RigModels {
  return {
    account: connection.model(ACCOUNT_MODEL, AccountSchema),
    journalEntry: connection.model(JOURNAL_ENTRY_MODEL, JournalEntrySchema),
    ledgerAccount: connection.model(LEDGER_ACCOUNT_MODEL, LedgerAccountSchema),
    product: connection.model(ProductSchemaClass.name, ProductSchema),
    usageCounter: connection.model(UsageCounterSchemaClass.name, UsageCounterSchema),
    feeCharge: connection.model(FEE_CHARGE_MODEL, FeeChargeSchema),
    chargeable: connection.model(CHARGEABLE_ACCOUNT_MODEL, ChargeableAccountSchema),
    journalRead: connection.model<JournalEntryLine>(FEE_JOURNAL_READ_MODEL, FeeJournalReadSchema),
    transaction: connection.model(TRANSACTION_MODEL, TransactionSchema),
  };
}

/** Writes the chart of accounts; sequential, so a failure names the account it stopped on. */
export async function seedChart(ledgerAccounts: LedgerAccountRepository): Promise<void> {
  for (const entry of CHART_OF_ACCOUNTS) {
    await ledgerAccounts.ensure({
      code: entry.code,
      name: entry.name,
      type: entry.type,
      isControlAccount: entry.isControlAccount,
    });
  }
}

/** The services, wired exactly as the module wires them, minus the queue processor. */
export function buildServices(connection: Connection, models: RigModels) {
  const ids = new IdGenerator();
  const clock = new ClockService();

  const accounts = new AccountRepository(models.account);
  const balancePort = new MongoAccountBalancePort(accounts, clock);
  const runner = new TransactionRunner(connection);
  const ledgerAccounts = new LedgerAccountRepository(models.ledgerAccount, ids);
  const postings = new PostingService(
    new JournalEntryRepository(models.journalEntry, ids),
    ledgerAccounts,
    balancePort,
    runner,
  );

  const products = new ProductService(new ProductRepository(models.product), clock, ids);
  const pricing = new ProductFeeService(new UsageCounterRepository(models.usageCounter), clock);
  const ownerPort = new InMemoryAccountOwnerPort();
  const projector = new TransactionProjectorService(
    new TransactionRepository(models.transaction, ids),
    balancePort,
    ownerPort,
    new CategorisationService(),
  );

  const charges = new FeeChargeRepository(models.feeCharge);
  const posting = new FeePostingService(postings, charges, runner, clock, projector);
  const charging = new FeeChargingService(
    accounts,
    products,
    pricing,
    new StaticTierPort(null),
    posting,
  );
  const premier = new FeeChargingService(
    accounts,
    products,
    pricing,
    new StaticTierPort('PREMIER'),
    posting,
  );
  const maintenance = new MaintenanceFeeService(
    new ChargeableAccountReader(models.chargeable),
    charging,
    clock,
  );
  const income = new FeeIncomeReader(models.journalRead);
  const reconciliation = new FeeReconciliationService(income, charges);

  return {
    clock,
    ids,
    charging,
    premier,
    maintenance,
    reconciliation,
    income,
    accounts,
    ownerPort,
    products,
    ledgerAccounts,
  };
}

export type RigServices = ReturnType<typeof buildServices>;

let serial = 30_000_000;
function nextSerial(): string {
  serial += 1;
  return String(serial).padStart(8, '0');
}

/** A fixture account, registered with the owner port so its fees project onto a statement. */
export async function openAccount(
  services: RigServices,
  input: { product: Product; openedAt: string; balanceMinor: string },
): Promise<string> {
  const userId = services.ids.generate('user');
  const identifiers = new AccountNumberService(services.accounts, {
    countryCode: 'GB',
    bankCode: 'RLNC',
    sortCode: '049921',
  }).identifiersFor(nextSerial());
  const zero = toStored(Money.zero('GBP'));
  const opening = toStored(Money.fromMinor(input.balanceMinor, 'GBP'));

  const result = await services.accounts.insert({
    id: services.ids.generate('account'),
    userId,
    holderIds: [userId],
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency: 'GBP',
    productCode: input.product.code,
    productVersion: input.product.version,
    productName: input.product.name,
    nickname: null,
    number: identifiers.number,
    sortCode: identifiers.sortCode,
    iban: identifiers.iban,
    ledgerBalance: opening,
    availableBalance: opening,
    holdTotal: zero,
    overdraftLimit: zero,
    minimumOpeningBalance: zero,
    interestRateBps: null,
    isPrimary: true,
    openedAt: new Date(input.openedAt),
  });

  if (!result.account) throw new Error(`Fixture account collided on ${result.conflictOn}`);
  services.ownerPort.register(result.account.id, userId);
  return result.account.id;
}
