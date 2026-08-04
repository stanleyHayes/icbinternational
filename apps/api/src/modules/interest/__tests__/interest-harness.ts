import { AccountStatus, type InterestTier } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  frozenClock,
  ledgerRigFor,
  retryingRunner,
  seedAccount,
  type LedgerRig,
  type SeedOverrides,
} from '../../accounts/__tests__/accounts-harness.js';
import { InMemoryAccountStore } from '../../accounts/index.js';
import { InMemoryAccrualStateStore } from '../in-memory-accrual-state.store.js';
import {
  InterestAccountSource,
  type AccrualPageQuery,
  type InterestBearingAccount,
} from '../interest-account.source.js';
import { InterestAccrualService } from '../interest-accrual.service.js';
import { InterestCapitalisationService } from '../interest-capitalisation.service.js';
import { InterestTermsSource } from '../interest-terms.source.js';

/** Account states in which credit interest keeps accruing. Mirrors the Mongo source. */
const ACCRUING: readonly AccountStatus[] = [AccountStatus.ACTIVE, AccountStatus.DORMANT];

/**
 * The tiered table the fixtures price by: 1% up to £1,000, 1.5% to £5,000, 2% above.
 * Bands are marginal, so £6,000 earns £90 a year — an annual figure a test can check
 * by hand without a calculator.
 */
export const TIERED_SAVINGS_TIERS: InterestTier[] = [
  {
    fromAmount: { amount: '0', currency: 'GBP' },
    toAmount: { amount: '100000', currency: 'GBP' },
    annualRateBps: 100,
  },
  {
    fromAmount: { amount: '100000', currency: 'GBP' },
    toAmount: { amount: '500000', currency: 'GBP' },
    annualRateBps: 150,
  },
  {
    fromAmount: { amount: '500000', currency: 'GBP' },
    toAmount: null,
    annualRateBps: 200,
  },
];

/**
 * The interest engine wired end to end over in-memory stores.
 *
 * Everything below the account and terms fakes is real: the accrual arithmetic, the
 * compare-and-set store, and — the point of the exercise — a genuine `PostingService`,
 * so a capitalisation in these tests books a real balanced journal entry against the
 * seeded chart of accounts rather than a spy's recollection of one.
 */
export interface InterestRig {
  accounts: InMemoryAccountStore;
  source: StaticInterestAccountSource;
  terms: StaticTermsSource;
  states: InMemoryAccrualStateStore;
  accrual: InterestAccrualService;
  capitalisation: InterestCapitalisationService;
  ledger: LedgerRig;
  clock: ClockService;
  runner: TransactionRunner;
}

/**
 * An `InterestAccountSource` over the lane's in-memory account book.
 *
 * Accounts are tracked explicitly at seeding and read live on every page, so a
 * capitalisation that moves a balance is visible to the next day's accrual — which is
 * exactly the compounding behaviour the year fixture asserts.
 */
export class StaticInterestAccountSource extends InterestAccountSource {
  private readonly tracked: string[] = [];

  constructor(private readonly store: InMemoryAccountStore) {
    super();
  }

  /** Adds an account to the book the engine enumerates. */
  track(accountId: string): void {
    this.tracked.push(accountId);
  }

  override async listInterestBearing(query: AccrualPageQuery): Promise<InterestBearingAccount[]> {
    const earning = await this.earningAccounts();
    const cursor = query.afterId;
    const after = cursor === undefined ? earning : earning.filter((account) => account.id > cursor);
    return after.slice(0, query.limit);
  }

  private async earningAccounts(): Promise<InterestBearingAccount[]> {
    const page: InterestBearingAccount[] = [];

    for (const id of [...this.tracked].sort()) {
      const record = await this.store.findById(id);
      if (record && record.interestRateBps !== null && ACCRUING.includes(record.status)) {
        page.push(toBearing(record));
      }
    }

    return page;
  }
}

/** A terms table stated outright — the fixture is the product catalogue. */
export class StaticTermsSource extends InterestTermsSource {
  private readonly byVersion = new Map<string, InterestTier[]>();

  register(productCode: string, productVersion: number, tiers: InterestTier[]): void {
    this.byVersion.set(keyOf(productCode, productVersion), tiers);
  }

  override async creditTiersFor(
    productCode: string,
    productVersion: number,
  ): Promise<InterestTier[]> {
    return this.byVersion.get(keyOf(productCode, productVersion)) ?? [];
  }
}

/** Wires the engine over in-memory stores with a frozen clock. */
export function interestRig(at: Date): InterestRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock(at);
  const runner = retryingRunner();
  const ledger = ledgerRigFor(accounts, clock, runner);

  const source = new StaticInterestAccountSource(accounts);
  const terms = new StaticTermsSource();
  const states = new InMemoryAccrualStateStore();

  return {
    accounts,
    source,
    terms,
    states,
    accrual: new InterestAccrualService(source, terms, states, clock),
    capitalisation: new InterestCapitalisationService(source, states, ledger.postings, clock),
    ledger,
    clock,
    runner,
  };
}

/** Seeds a fixture account and adds it to the book the engine enumerates. */
export async function seedInterestAccount(
  rig: InterestRig,
  overrides: SeedOverrides = {},
): Promise<string> {
  const accountId = await seedAccount(rig.accounts, overrides);
  rig.source.track(accountId);
  return accountId;
}

function keyOf(productCode: string, productVersion: number): string {
  return `${productCode}@${productVersion}`;
}

function toBearing(record: {
  id: string;
  currency: string;
  productCode: string;
  productVersion: number;
  ledgerBalance: { amount: string; currency: string };
}): InterestBearingAccount {
  return {
    id: record.id,
    currency: record.currency,
    productCode: record.productCode,
    productVersion: record.productVersion,
    ledgerBalance: { ...record.ledgerBalance },
  };
}
