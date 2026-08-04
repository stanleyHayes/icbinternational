import { type ClientSession } from 'mongoose';

import { AccountStatus, AccountType, type Product } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import { PostingService } from '../../ledger/posting.service.js';
import { InMemoryJournalEntryStore } from '../../ledger/repositories/in-memory-journal-entry.store.js';
import { InMemoryLedgerAccountStore } from '../../ledger/repositories/in-memory-ledger-account.store.js';
import { AccountNumberService } from '../account-number.service.js';
import { type BankIdentity } from '../account.constants.js';
import { type NewAccount } from '../account.store.js';
import { type InMemoryAccountStore } from '../in-memory-account.store.js';
import { MongoAccountBalancePort } from '../mongo-account-balance.port.js';

/**
 * Shared fixtures for the accounts and holds suites.
 *
 * The in-memory stores are production code — other lanes use them — so what lives here is
 * only the wiring: a runner that executes work inline but honours the same retry contract
 * the real one does, a frozen clock, and builders whose defaults let a test state only
 * what it is actually about.
 */

/** The identity every fixture account is minted under. Matches the shipped defaults. */
export const TEST_BANK: BankIdentity = {
  countryCode: 'GB',
  bankCode: 'RLNC',
  sortCode: '049921',
};

export const TEST_NOW = new Date('2026-03-01T09:00:00.000Z');
export const TEST_USER = 'usr_01JQ8Z0000000000000000TEST';
export const OTHER_USER = 'usr_01JQ8Z0000000000000OTHER1';

/** A clock pinned to {@link TEST_NOW}, so every timestamp in a test is predictable. */
export function frozenClock(at: Date = TEST_NOW): ClockService {
  const clock = new ClockService();
  clock.freezeAt(at);
  return clock;
}

/**
 * A `TransactionRunner` that runs inline and retries transient failures.
 *
 * The retry is the point. Optimistic-concurrency conflicts are raised as errors labelled
 * `TransientTransactionError`, and a fake that swallowed or ignored the label would make
 * the concurrency tests prove nothing — they would never exercise the second attempt that
 * re-reads the account and re-runs the funds check.
 */
export function retryingRunner(maxAttempts = 5): TransactionRunner {
  const session = {} as ClientSession;

  const run = async <T>(work: (active: ClientSession) => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await work(session);
      } catch (error) {
        if (!isTransient(error)) throw error;
        lastError = error;
      }
    }

    throw lastError;
  };

  return {
    run,
    runIn: <T>(outer: ClientSession | undefined, work: (active: ClientSession) => Promise<T>) =>
      outer ? work(outer) : run(work),
  } as unknown as TransactionRunner;
}

function isTransient(error: unknown): boolean {
  const labels: unknown = (error as { errorLabels?: unknown }).errorLabels;
  return Array.isArray(labels) && labels.includes('TransientTransactionError');
}

/** The dummy session every in-memory store ignores. */
export const TEST_SESSION = {} as ClientSession;

/** Everything the accounts and holds services need, wired to in-memory stores. */
export interface LedgerRig {
  entries: InMemoryJournalEntryStore;
  glAccounts: InMemoryLedgerAccountStore;
  postings: PostingService;
  balancePort: MongoAccountBalancePort;
}

/** A real `PostingService` over in-memory stores and the real Mongo balance adapter. */
export function ledgerRigFor(
  accounts: InMemoryAccountStore,
  clock: ClockService,
  runner: TransactionRunner,
): LedgerRig {
  const entries = new InMemoryJournalEntryStore();
  const glAccounts = new InMemoryLedgerAccountStore().seedChart();
  const balancePort = new MongoAccountBalancePort(accounts, clock);

  return {
    entries,
    glAccounts,
    balancePort,
    postings: new PostingService(entries, glAccounts, balancePort, runner),
  };
}

/** An `AccountNumberService` over a store, minting real Reliance identifiers. */
export function numberServiceFor(accounts: InMemoryAccountStore): AccountNumberService {
  return new AccountNumberService(accounts, TEST_BANK);
}

/** GBP minor units, spelled once. */
export function gbp(minor: string | number): Money {
  return Money.fromMinor(minor, 'GBP');
}

const ids = new IdGenerator();

/**
 * Inserts a fixture account.
 *
 * Defaults describe an ordinary, funded current account: active, GBP, no facility, no
 * holds. A test overrides only the field it is about.
 */
export async function seedAccount(
  accounts: InMemoryAccountStore,
  overrides: SeedOverrides = {},
): Promise<string> {
  const currency = (overrides.currency ?? 'GBP') as CurrencyCode;
  const ledger = overrides.ledger ?? Money.zero(currency);
  const held = overrides.held ?? Money.zero(currency);
  const overdraft = overrides.overdraft ?? Money.zero(currency);

  const rest = withoutBalanceShorthands(overrides);
  const serial = String(nextSerial()).padStart(8, '0');
  const identifiers = new AccountNumberService(accounts, TEST_BANK).identifiersFor(serial);

  const result = await accounts.insert({
    id: ids.generate('account'),
    userId: TEST_USER,
    holderIds: [TEST_USER],
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency,
    productCode: 'EVERYDAY_CURRENT',
    productVersion: 1,
    productName: 'Everyday Current',
    nickname: null,
    number: identifiers.number,
    sortCode: identifiers.sortCode,
    iban: identifiers.iban,
    ledgerBalance: toStored(ledger),
    availableBalance: toStored(ledger.minus(held)),
    holdTotal: toStored(held),
    overdraftLimit: toStored(overdraft),
    minimumOpeningBalance: toStored(Money.zero(currency)),
    interestRateBps: null,
    isPrimary: true,
    openedAt: TEST_NOW,
    ...rest,
  });

  if (!result.account) throw new Error(`Fixture account collided on ${result.conflictOn}`);
  return result.account.id;
}

/** Field overrides, plus `Money` shorthands for the three balances a test usually sets. */
export type SeedOverrides = Partial<NewAccount> & {
  ledger?: Money;
  held?: Money;
  overdraft?: Money;
};

const BALANCE_SHORTHANDS = ['ledger', 'held', 'overdraft'] as const;

/** Strips the shorthands so the remainder is a clean partial of the stored shape. */
function withoutBalanceShorthands(overrides: SeedOverrides): Partial<NewAccount> {
  const copy: Record<string, unknown> = { ...overrides };
  for (const key of BALANCE_SHORTHANDS) delete copy[key];
  return copy as Partial<NewAccount>;
}

let serialCounter = 10_000_000;
function nextSerial(): number {
  serialCounter += 1;
  return serialCounter;
}

/** A complete product, defaulting to the shipped everyday current account. */
export function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    code: 'EVERYDAY_CURRENT',
    version: 1,
    name: 'Everyday Current',
    tagline: 'The account your salary lands in',
    description: 'A current account for everyday spending.',
    accountType: AccountType.CURRENT,
    currencies: ['GBP'],
    minKycTier: 1,
    minOpeningBalance: { amount: '0', currency: 'GBP' },
    minBalance: { amount: '0', currency: 'GBP' },
    monthlyFee: { amount: '0', currency: 'GBP' },
    creditInterestTiers: [],
    debitInterestBps: null,
    fees: [],
    limits: {
      internalTransfer: emptyMatrix(),
      domesticTransfer: emptyMatrix(),
      internationalTransfer: emptyMatrix(),
      cardSpend: emptyMatrix(),
      atmWithdrawal: emptyMatrix(),
    },
    features: [],
    active: true,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    ...overrides,
  };
}

function emptyMatrix() {
  return { perTransaction: null, daily: null, monthly: null, dailyCount: null };
}

/**
 * Awaits a call that is expected to reject and returns the `AppError` it threw.
 *
 * Replaces `promise.catch((thrown) => thrown as AppError)`, which has two defects: the
 * result is typed as a union with the success value, and — worse — a call that wrongly
 * *succeeds* slips through with the assertions reading properties off the happy-path
 * object and quietly passing. This fails loudly instead.
 */
export async function rejectionFrom(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (thrown) {
    if (thrown instanceof AppError) return thrown;
    throw thrown;
  }
  throw new Error('Expected the call to reject with an AppError, but it resolved');
}
