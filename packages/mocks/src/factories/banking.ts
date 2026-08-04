/**
 * Core banking fixtures: accounts, balances, transactions, journal entries, statements.
 *
 * `makeTransaction` takes the account it belongs to and reads the currency off it rather
 * than picking one. A transaction in a currency its account does not hold is the kind of
 * incoherence that teaches a UI to defend against impossible states.
 */

import {
  AccountStatus,
  AccountType,
  EntryType,
  HoldReason,
  HoldStatus,
  JournalEntryStatus,
  PostingDirection,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
  type Account,
  type Balance,
  type Counterparty,
  type Hold,
  type JournalEntry,
  type Statement,
  type Transaction,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import type { MockClock } from '../db/clock.js';
import { addMoney, money, subtractMoney, zero, type BASE_CURRENCY } from '../db/money.js';
import { faker, mockId, pickOne, times } from '../faker.js';

import type { FactoryOptions } from './identity.js';

/** Product codes the mock catalogue offers. */
export const MOCK_PRODUCT_CODES = {
  CURRENT: 'RB-CURRENT-PLUS',
  SAVINGS: 'RB-SAVER-EASY',
  BUSINESS: 'RB-BUSINESS-PRO',
  FX_WALLET: 'RB-MULTI-CURRENCY',
} as const;

const PRODUCT_NAMES: Record<string, string> = {
  [MOCK_PRODUCT_CODES.CURRENT]: 'Current Account Plus',
  [MOCK_PRODUCT_CODES.SAVINGS]: 'Easy Access Saver',
  [MOCK_PRODUCT_CODES.BUSINESS]: 'Business Pro',
  [MOCK_PRODUCT_CODES.FX_WALLET]: 'Multi-Currency Wallet',
};

/** Merchants the mock spends at. A stable cast keeps insight charts recognisable. */
export const MOCK_MERCHANTS: readonly { name: string; mcc: string; category: SpendCategory }[] = [
  { name: 'Waitrose', mcc: '5411', category: SpendCategory.GROCERIES },
  { name: 'Pret A Manger', mcc: '5812', category: SpendCategory.DINING },
  { name: 'Transport for London', mcc: '4111', category: SpendCategory.TRANSPORT },
  { name: 'Shell', mcc: '5541', category: SpendCategory.FUEL },
  { name: 'John Lewis', mcc: '5311', category: SpendCategory.SHOPPING },
  { name: 'Netflix', mcc: '4899', category: SpendCategory.SUBSCRIPTIONS },
  { name: 'Spotify', mcc: '5815', category: SpendCategory.SUBSCRIPTIONS },
  { name: 'Thames Water', mcc: '4900', category: SpendCategory.UTILITIES },
  { name: 'Boots', mcc: '5912', category: SpendCategory.HEALTH },
  { name: 'British Airways', mcc: '3000', category: SpendCategory.TRAVEL },
];

/** A balance projection consistent with itself: available = ledger − held. */
export function makeBalance(options: {
  clock: MockClock;
  ledgerMinor: bigint;
  heldMinor?: bigint;
  overdraftMinor?: bigint;
  currency?: CurrencyCode;
}): Balance {
  const currency = options.currency ?? ('GBP' as typeof BASE_CURRENCY);
  const ledger = money(options.ledgerMinor, currency);
  const held = money(options.heldMinor ?? 0n, currency);
  const overdraftAvailable = money(options.overdraftMinor ?? 0n, currency);

  return {
    ledger,
    held,
    overdraftAvailable,
    available: addMoney(subtractMoney(ledger, held), overdraftAvailable),
    asOf: options.clock.nowIso(),
  };
}

/** An account. */
export function makeAccount(
  options: FactoryOptions<Account> & { userId: string; type?: AccountType },
): Account {
  const { clock, overrides, userId } = options;
  const type = options.type ?? AccountType.CURRENT;
  const productCode = productCodeFor(type);
  const currency: CurrencyCode = type === AccountType.FX_WALLET ? 'EUR' : 'GBP';

  return {
    id: mockId('acc'),
    userId,
    type,
    status: AccountStatus.ACTIVE,
    currency,
    productCode,
    productName: PRODUCT_NAMES[productCode] ?? 'Reliance Account',
    nickname: null,
    number: faker.string.numeric(10),
    sortCode: faker.string.numeric(6),
    iban: `GB${faker.string.numeric(2)}RLNC${faker.string.numeric(14)}`,
    balance: makeBalance({ clock, ledgerMinor: BigInt(defaultLedgerMinor(type)), currency }),
    holderIds: [userId],
    interestRateBps: type === AccountType.SAVINGS ? 425 : null,
    isPrimary: type === AccountType.CURRENT,
    openedAt: clock.daysAgo(faker.number.int({ min: 120, max: 800 })),
    closedAt: null,
    ...overrides,
  };
}

function productCodeFor(type: AccountType): string {
  if (type === AccountType.SAVINGS) return MOCK_PRODUCT_CODES.SAVINGS;
  if (type === AccountType.BUSINESS) return MOCK_PRODUCT_CODES.BUSINESS;
  if (type === AccountType.FX_WALLET) return MOCK_PRODUCT_CODES.FX_WALLET;
  return MOCK_PRODUCT_CODES.CURRENT;
}

function defaultLedgerMinor(type: AccountType): number {
  if (type === AccountType.SAVINGS) return faker.number.int({ min: 500_000, max: 4_000_000 });
  if (type === AccountType.FX_WALLET) return faker.number.int({ min: 20_000, max: 400_000 });
  return faker.number.int({ min: 80_000, max: 900_000 });
}

/** A card-spend counterparty. */
export function makeCounterparty(overrides?: Partial<Counterparty>): Counterparty {
  const merchant = pickOne(MOCK_MERCHANTS);

  return {
    name: merchant.name,
    merchantId: faker.string.alphanumeric({ length: 10, casing: 'upper' }),
    mcc: merchant.mcc,
    logoUrl: null,
    accountNumberMasked: null,
    country: 'GB',
    ...overrides,
  };
}

/**
 * A transaction against a specific account.
 *
 * `runningBalance` is supplied by the caller rather than invented, because it only means
 * anything as part of an ordered series — the seed builder walks the account's history
 * and threads the balance through.
 */
export function makeTransaction(
  options: FactoryOptions<Transaction> & {
    account: Account;
    runningBalanceMinor: bigint;
  },
): Transaction {
  const { account, clock, overrides, runningBalanceMinor } = options;
  const merchant = pickOne(MOCK_MERCHANTS);
  const currency = account.currency as CurrencyCode;
  const amountMinor = BigInt(faker.number.int({ min: 350, max: 24_000 }));

  return {
    id: mockId('txn'),
    accountId: account.id,
    journalEntryId: mockId('jnl'),
    direction: TransactionDirection.DEBIT,
    status: TransactionStatus.COMPLETED,
    type: EntryType.CARD_PURCHASE,
    amount: money(amountMinor, currency),
    runningBalance: money(runningBalanceMinor, currency),
    originalAmount: null,
    exchangeRate: null,
    description: merchant.name,
    reference: null,
    category: merchant.category,
    categoryOverridden: false,
    counterparty: makeCounterparty({ name: merchant.name, mcc: merchant.mcc }),
    notes: null,
    attachmentIds: [],
    disputeId: null,
    bookedAt: clock.daysAgo(faker.number.int({ min: 0, max: 90 })),
    completedAt: clock.daysAgo(faker.number.int({ min: 0, max: 90 })),
    ...overrides,
  };
}

/** A balanced journal entry — two postings that sum to zero, as the ledger demands. */
export function makeJournalEntry(
  options: FactoryOptions<JournalEntry> & {
    accountId: string;
    amountMinor: bigint;
    currency: CurrencyCode;
    type?: EntryType;
    description?: string;
  },
): JournalEntry {
  const { accountId, amountMinor, clock, currency, overrides } = options;
  const amount = money(amountMinor < 0n ? -amountMinor : amountMinor, currency);
  const description = options.description ?? 'Card purchase';

  return {
    id: mockId('jnl'),
    reference: faker.string.alphanumeric({ length: 12, casing: 'upper' }),
    type: options.type ?? EntryType.CARD_PURCHASE,
    status: JournalEntryStatus.POSTED,
    description,
    valueDate: clock.todayIso(),
    bookedAt: clock.nowIso(),
    postings: [
      {
        ledgerAccountCode: '2100',
        ledgerAccountName: 'Customer deposits',
        accountId,
        direction: PostingDirection.DEBIT,
        amount,
        narrative: description,
      },
      {
        ledgerAccountCode: '1200',
        ledgerAccountName: 'Card scheme settlement',
        accountId: null,
        direction: PostingDirection.CREDIT,
        amount,
        narrative: description,
      },
    ],
    reversesEntryId: null,
    reversedByEntryId: null,
    ...overrides,
  };
}

/** A hold against an account. */
export function makeHold(options: FactoryOptions<Hold> & { accountId: string }): Hold {
  const { accountId, clock, overrides } = options;

  return {
    id: mockId('hld'),
    accountId,
    amount: money(faker.number.int({ min: 500, max: 15_000 })),
    reason: HoldReason.CARD_AUTHORISATION,
    status: HoldStatus.ACTIVE,
    description: 'Pending card authorisation',
    placedAt: clock.daysAgo(1),
    expiresAt: clock.daysAhead(6),
    resolvedAt: null,
    ...overrides,
  };
}

/** A monthly statement. */
export function makeStatement(
  options: FactoryOptions<Statement> & { account: Account; monthsAgo: number },
): Statement {
  const { account, clock, monthsAgo, overrides } = options;
  const DAYS_PER_MONTH = 30;
  const periodEnd = clock.dateDaysAgo(monthsAgo * DAYS_PER_MONTH);
  const periodStart = clock.dateDaysAgo((monthsAgo + 1) * DAYS_PER_MONTH);
  const currency = account.currency as CurrencyCode;
  const credits = money(faker.number.int({ min: 150_000, max: 400_000 }), currency);
  const debits = money(faker.number.int({ min: 120_000, max: 380_000 }), currency);
  const opening = money(faker.number.int({ min: 50_000, max: 500_000 }), currency);

  return {
    id: mockId('stm'),
    accountId: account.id,
    period: periodEnd.slice(0, 7),
    periodStart,
    periodEnd,
    openingBalance: opening,
    closingBalance: subtractMoney(addMoney(opening, credits), debits),
    totalCredits: credits,
    totalDebits: debits,
    transactionCount: faker.number.int({ min: 18, max: 90 }),
    downloadUrl: `https://assets.reliance.test/statements/${mockId('stm')}.pdf`,
    sizeBytes: faker.number.int({ min: 40_000, max: 400_000 }),
    generatedAt: clock.daysAgo(monthsAgo * DAYS_PER_MONTH),
    ...overrides,
  };
}

/** A run of statements, newest first. */
export function makeStatements(options: {
  clock: MockClock;
  account: Account;
  count: number;
}): Statement[] {
  return times(options.count, (index) =>
    makeStatement({ clock: options.clock, account: options.account, monthsAgo: index }),
  );
}

/** Zero in an account's currency — used when a projection has nothing to report. */
export function zeroFor(account: Account) {
  return zero(account.currency as CurrencyCode);
}
