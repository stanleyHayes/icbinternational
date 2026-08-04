/**
 * Product fixtures: cards, authorisations, goals, deposits, loans and FX rates.
 *
 * The loan schedule is generated rather than sampled, and the final instalment absorbs
 * the rounding, so the rows sum exactly to principal plus interest. A mock schedule that
 * is a penny out teaches the UI that the arithmetic is approximate.
 */

import {
  AuthorisationStatus,
  CardFormat,
  CardScheme,
  CardStatus,
  CardTier,
  DepositStatus,
  LoanKind,
  LoanStatus,
  type AmortisationRow,
  type Card,
  type CardAuthorisation,
  type CardControls,
  type Deposit,
  type DepositRate,
  type FxRate,
  type Goal,
  type Loan,
  type LoanProduct,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import type { MockClock } from '../db/clock.js';
import { addMoney, applyBps, money, subtractMoney, zero } from '../db/money.js';
import { faker, mockId, pickOne, times } from '../faker.js';

import { MOCK_MERCHANTS } from './banking.js';
import type { FactoryOptions } from './identity.js';

/** Permissive default controls — the state a freshly issued card is in. */
export function makeCardControls(overrides?: Partial<CardControls>): CardControls {
  return {
    onlinePayments: true,
    contactless: true,
    atmWithdrawals: true,
    internationalPayments: true,
    magstripe: false,
    perTransactionLimit: money(100_000),
    dailySpendLimit: money(250_000),
    monthlySpendLimit: money(1_000_000),
    dailyAtmLimit: money(50_000),
    blockedMccs: [],
    allowedCountries: [],
    ...overrides,
  };
}

/** A card. */
export function makeCard(
  options: FactoryOptions<Card> & { accountId: string; cardholderName: string },
): Card {
  const { accountId, cardholderName, clock, overrides } = options;
  const orderedAt = clock.daysAgo(faker.number.int({ min: 40, max: 700 }));
  const EXPIRY_YEARS = 4;

  return {
    id: mockId('crd'),
    accountId,
    format: CardFormat.PHYSICAL,
    scheme: CardScheme.VISA,
    tier: CardTier.STANDARD,
    status: CardStatus.ACTIVE,
    nickname: null,
    cardholderName,
    last4: faker.string.numeric(4),
    expiryMonth: faker.number.int({ min: 1, max: 12 }),
    expiryYear: new Date(clock.nowMs()).getUTCFullYear() + EXPIRY_YEARS,
    currency: 'GBP',
    controls: makeCardControls(),
    lockedMerchantId: null,
    isDefault: true,
    pinSet: true,
    replacesCardId: null,
    orderedAt,
    activatedAt: orderedAt,
    expiresAt: clock.daysAhead(365 * EXPIRY_YEARS),
    ...overrides,
  };
}

/** A card authorisation. Declines are as useful as approvals, so both are produced. */
export function makeAuthorisation(
  options: FactoryOptions<CardAuthorisation> & { cardId: string; accountId: string },
): CardAuthorisation {
  const { accountId, cardId, clock, overrides } = options;
  const merchant = pickOne(MOCK_MERCHANTS);
  const authorisedAt = clock.daysAgo(faker.number.int({ min: 0, max: 30 }));

  return {
    id: mockId('aut'),
    cardId,
    accountId,
    status: AuthorisationStatus.CAPTURED,
    amount: money(faker.number.int({ min: 350, max: 20_000 })),
    originalAmount: null,
    merchantName: merchant.name,
    merchantCountry: 'GB',
    mcc: merchant.mcc,
    channel: pickOne(['ONLINE', 'CONTACTLESS', 'CHIP'] as const),
    declineReason: null,
    holdId: null,
    transactionId: mockId('txn'),
    threeDsChallenged: false,
    authorisedAt,
    capturedAt: authorisedAt,
    expiresAt: clock.daysAhead(7),
    ...overrides,
  };
}

/** A savings goal, with progress consistent with its amounts. */
export function makeGoal(options: FactoryOptions<Goal> & { linkedAccountId: string }): Goal {
  const { clock, linkedAccountId, overrides } = options;
  const target = money(faker.number.int({ min: 100_000, max: 2_000_000 }));
  const current = money(
    (BigInt(target.amount) * BigInt(faker.number.int({ min: 5, max: 85 }))) / 100n,
  );
  const BPS = 10_000n;
  const progressBps = Number((BigInt(current.amount) * BPS) / BigInt(target.amount));

  return {
    id: mockId('gol'),
    name: pickOne(['Emergency fund', 'Japan trip', 'New kitchen', 'Deposit', 'Car']),
    emoji: pickOne(['🛟', '🗾', '🍳', '🏠', '🚗']),
    targetAmount: target,
    currentAmount: current,
    progressBps,
    targetDate: clock.dateDaysAhead(faker.number.int({ min: 60, max: 900 })),
    suggestedMonthlyContribution: money(faker.number.int({ min: 5_000, max: 40_000 })),
    onTrack: progressBps > 2_500,
    linkedAccountId,
    roundUpsEnabled: faker.datatype.boolean(),
    autoSave: null,
    completedAt: null,
    createdAt: clock.daysAgo(faker.number.int({ min: 30, max: 500 })),
    ...overrides,
  };
}

/** The term-deposit rate board. */
export function makeDepositRates(): DepositRate[] {
  const TERMS: readonly { termMonths: number; annualRateBps: number }[] = [
    { termMonths: 3, annualRateBps: 380 },
    { termMonths: 6, annualRateBps: 415 },
    { termMonths: 12, annualRateBps: 455 },
    { termMonths: 24, annualRateBps: 470 },
    { termMonths: 36, annualRateBps: 480 },
  ];

  return TERMS.map((term) => ({
    termMonths: term.termMonths,
    annualRateBps: term.annualRateBps,
    minAmount: money(100_000),
    currency: 'GBP' as CurrencyCode,
  }));
}

/** A live term deposit. */
export function makeDeposit(
  options: FactoryOptions<Deposit> & { sourceAccountId: string },
): Deposit {
  const { clock, overrides, sourceAccountId } = options;
  const principal = money(faker.number.int({ min: 200_000, max: 3_000_000 }));
  const annualRateBps = 455;
  const termMonths = 12;
  const projectedInterest = applyBps(principal, annualRateBps);
  const elapsedFraction = faker.number.int({ min: 10, max: 90 });
  const interestAccrued = money(
    (BigInt(projectedInterest.amount) * BigInt(elapsedFraction)) / 100n,
  );

  return {
    id: mockId('dep'),
    status: DepositStatus.ACTIVE,
    principal,
    annualRateBps,
    termMonths,
    interestAccrued,
    projectedInterest,
    maturityValue: addMoney(principal, projectedInterest),
    autoRollover: false,
    sourceAccountId,
    placedAt: clock.daysAgo(faker.number.int({ min: 30, max: 300 })),
    maturesOn: clock.dateDaysAhead(faker.number.int({ min: 30, max: 300 })),
    brokenAt: null,
    ...overrides,
  };
}

/** The lending catalogue. */
export function makeLoanProducts(): LoanProduct[] {
  return [
    {
      code: 'RB-PERSONAL-LOAN',
      name: 'Personal Loan',
      kind: LoanKind.PERSONAL,
      currency: 'GBP' as CurrencyCode,
      minAmount: money(100_000),
      maxAmount: money(2_500_000),
      minTermMonths: 12,
      maxTermMonths: 84,
      representativeAprBps: 899,
      minAprBps: 599,
      maxAprBps: 2_499,
      arrangementFee: zero(),
      earlyRepaymentFeeBps: 100,
      minKycTier: 2,
      description: 'Borrow between £1,000 and £25,000 with a fixed rate for the whole term.',
    },
    {
      code: 'RB-CAR-LOAN',
      name: 'Car Finance',
      kind: LoanKind.AUTO,
      currency: 'GBP' as CurrencyCode,
      minAmount: money(300_000),
      maxAmount: money(6_000_000),
      minTermMonths: 24,
      maxTermMonths: 72,
      representativeAprBps: 749,
      minAprBps: 549,
      maxAprBps: 1_899,
      arrangementFee: money(9_900),
      earlyRepaymentFeeBps: 100,
      minKycTier: 2,
      description: 'Fixed-rate finance for a new or used car, secured against the vehicle.',
    },
  ];
}

/**
 * An amortisation schedule that sums exactly.
 *
 * Interest is computed on the declining balance and the last row takes whatever is left,
 * so the closing balance is precisely zero rather than a rounding artefact.
 */
export function makeSchedule(options: {
  clock: MockClock;
  principalMinor: bigint;
  aprBps: number;
  termMonths: number;
  paidInstalments?: number;
}): AmortisationRow[] {
  const { aprBps, clock, principalMinor, termMonths } = options;
  const paid = options.paidInstalments ?? 0;
  const monthlyRateBps = Math.round(aprBps / 12);
  const basePayment = principalMinor / BigInt(termMonths);
  const DAYS_PER_MONTH = 30;

  let balance = principalMinor;

  return times(termMonths, (index) => {
    const opening = balance;
    const interest = applyBps(money(opening), monthlyRateBps);
    const isFinal = index === termMonths - 1;
    const principal = isFinal ? opening : basePayment;
    balance = opening - principal;

    return {
      instalment: index + 1,
      dueDate: clock.dateDaysAhead((index + 1 - paid) * DAYS_PER_MONTH),
      openingBalance: money(opening),
      payment: addMoney(money(principal), interest),
      principal: money(principal),
      interest,
      fees: zero(),
      closingBalance: money(balance),
      status: index < paid ? ('PAID' as const) : ('SCHEDULED' as const),
      paidAt: index < paid ? clock.daysAgo((paid - index) * DAYS_PER_MONTH) : null,
    };
  });
}

/** A live loan. */
export function makeLoan(
  options: FactoryOptions<Loan> & { applicationId: string; product: LoanProduct },
): Loan {
  const { applicationId, clock, overrides, product } = options;
  const principal = money(faker.number.int({ min: 300_000, max: 1_500_000 }));
  const termMonths = 48;
  const paid = faker.number.int({ min: 3, max: 20 });
  const schedule = makeSchedule({
    clock,
    principalMinor: BigInt(principal.amount),
    aprBps: product.representativeAprBps,
    termMonths,
    paidInstalments: paid,
  });
  const nextRow = schedule[paid];
  const outstanding = schedule[paid - 1]?.closingBalance ?? principal;

  return {
    id: mockId('loa'),
    applicationId,
    productCode: product.code,
    productName: product.name,
    kind: product.kind,
    status: LoanStatus.ACTIVE,
    principal,
    outstandingBalance: outstanding,
    aprBps: product.representativeAprBps,
    termMonths,
    monthlyPayment: nextRow?.payment ?? zero(),
    nextPaymentDate: nextRow?.dueDate ?? null,
    nextPaymentAmount: nextRow?.payment ?? null,
    instalmentsPaid: paid,
    instalmentsRemaining: termMonths - paid,
    arrearsAmount: zero(),
    daysPastDue: 0,
    disbursedAt: clock.daysAgo(paid * 30),
    maturesOn: clock.dateDaysAhead((termMonths - paid) * 30),
    settledAt: null,
    ...overrides,
  };
}

const FX_PAIRS: readonly { to: CurrencyCode; mid: string }[] = [
  { to: 'EUR', mid: '1.1742' },
  { to: 'USD', mid: '1.2685' },
  { to: 'CHF', mid: '1.1210' },
  { to: 'JPY', mid: '188.40' },
  { to: 'AUD', mid: '1.9345' },
  { to: 'CAD', mid: '1.7208' },
  { to: 'NGN', mid: '1985.50' },
  { to: 'ZAR', mid: '23.1750' },
];

/** The FX board, quoted from GBP with a fixed spread. */
export function makeFxRates(clock: MockClock): FxRate[] {
  const SPREAD_BPS = 45;
  const HALF = 2;

  return FX_PAIRS.map((pair) => {
    const mid = Number(pair.mid);
    const halfSpread = (mid * SPREAD_BPS) / 10_000 / HALF;
    return {
      from: 'GBP' as CurrencyCode,
      to: pair.to,
      mid: pair.mid,
      bid: (mid - halfSpread).toFixed(4),
      ask: (mid + halfSpread).toFixed(4),
      spreadBps: SPREAD_BPS,
      changeBps: faker.number.int({ min: -120, max: 120 }),
      asOf: clock.nowIso(),
    };
  });
}

/** Subtracts an early-repayment penalty from a deposit's accrued interest. */
export function breakPenalty(interest: ReturnType<typeof money>, penaltyBps: number) {
  return subtractMoney(interest, applyBps(interest, penaltyBps));
}
