import { CustomerSegment } from '@reliance/contracts';

import { SUBSCRIPTION, type SubscriptionName } from './merchant-directory.js';

/**
 * The people who bank here.
 *
 * A demonstration dataset of a hundred identical customers proves nothing. These
 * archetypes exist so that every screen has something real to show and every rule has
 * something to fire on: the arrears dashboard needs a customer in arrears, the AML queue
 * needs someone structuring, the dormancy job needs an account nobody has touched. Build
 * the awkward cases deliberately or discover at demo time that half the product is empty.
 *
 * Every name and address here is invented. No real person's data is in this file.
 */

export interface PersonaAccount {
  readonly productCode: string;
  readonly currency: string;
  readonly nickname?: string;
  /** Opening balance in minor units, funded from the treasury clearing account. */
  readonly openingMinor: number;
}

export interface Persona {
  readonly key: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly segment: CustomerSegment;
  /** 0–3. Drives which products they can hold and what limits apply. */
  readonly kycTier: number;
  readonly accounts: readonly PersonaAccount[];
  /** Monthly salary in minor units. Zero means no regular inbound credit. */
  readonly monthlySalaryMinor: number;
  /** Day of month the salary lands. */
  readonly salaryDay: number;
  /** Roughly how many discretionary card purchases a month. */
  readonly purchasesPerMonth: number;
  /** Subscriptions this persona holds. Checked against the merchant directory. */
  readonly subscriptions: readonly SubscriptionName[];
  /** Months of history to generate. */
  readonly historyMonths: number;
  /** What this persona exists to demonstrate. Shown in the showcase summary. */
  readonly demonstrates: string;
}

const GBP = 'GBP';

export const PERSONAS: readonly Persona[] = Object.freeze([
  {
    key: 'salaried',
    firstName: 'Amara',
    lastName: 'Okonkwo',
    email: 'amara.okonkwo@example.com',
    phone: '+447700900101',
    segment: CustomerSegment.PERSONAL,
    kycTier: 2,
    accounts: [
      { productCode: 'EVERYDAY_CURRENT', currency: GBP, openingMinor: 184_250 },
      {
        productCode: 'RELIANCE_SAVER',
        currency: GBP,
        nickname: 'Emergency fund',
        openingMinor: 620_000,
      },
    ],
    monthlySalaryMinor: 341_600,
    salaryDay: 28,
    purchasesPerMonth: 34,
    subscriptions: [
      SUBSCRIPTION.NETFLIX,
      SUBSCRIPTION.SPOTIFY,
      SUBSCRIPTION.MOBILE,
      SUBSCRIPTION.WATER,
      SUBSCRIPTION.GAS,
    ],
    historyMonths: 14,
    demonstrates: 'The default view. Salary in, steady spend, savings growing.',
  },
  {
    key: 'student',
    firstName: 'Ravi',
    lastName: 'Chandran',
    email: 'ravi.chandran@example.com',
    phone: '+447700900102',
    segment: CustomerSegment.PERSONAL,
    kycTier: 1,
    accounts: [{ productCode: 'STUDENT_CURRENT', currency: GBP, openingMinor: 21_400 }],
    monthlySalaryMinor: 78_000,
    salaryDay: 5,
    purchasesPerMonth: 42,
    subscriptions: [SUBSCRIPTION.SPOTIFY, SUBSCRIPTION.MOBILE],
    historyMonths: 9,
    // Small balances and frequent small spend is where rounding and minimum-balance
    // rules actually bite; a dataset of comfortable customers never exercises them.
    demonstrates: 'Thin margins. Many small purchases, occasional near-zero balance.',
  },
  {
    key: 'freelancer',
    firstName: 'Sofia',
    lastName: 'Marchetti',
    email: 'sofia.marchetti@example.com',
    phone: '+447700900103',
    segment: CustomerSegment.PERSONAL,
    kycTier: 3,
    accounts: [
      { productCode: 'EVERYDAY_CURRENT', currency: GBP, openingMinor: 512_800 },
      {
        productCode: 'FX_WALLET',
        currency: 'EUR',
        nickname: 'Client payments',
        openingMinor: 148_000,
      },
      {
        productCode: 'RELIANCE_SAVER',
        currency: GBP,
        nickname: 'Tax set-aside',
        openingMinor: 940_000,
      },
    ],
    monthlySalaryMinor: 0,
    salaryDay: 1,
    purchasesPerMonth: 26,
    subscriptions: [SUBSCRIPTION.NETFLIX, SUBSCRIPTION.MOBILE, SUBSCRIPTION.HOME_INSURANCE],
    historyMonths: 18,
    demonstrates: 'Irregular income and a second currency. Exercises FX and lumpy cashflow.',
  },
  {
    key: 'family',
    firstName: 'Tom',
    lastName: 'Whitfield',
    email: 'tom.whitfield@example.com',
    phone: '+447700900104',
    segment: CustomerSegment.PERSONAL,
    kycTier: 2,
    accounts: [
      { productCode: 'EVERYDAY_CURRENT', currency: GBP, openingMinor: 96_300 },
      {
        productCode: 'RELIANCE_SAVER',
        currency: GBP,
        nickname: 'House deposit',
        openingMinor: 1_840_000,
      },
    ],
    monthlySalaryMinor: 428_000,
    salaryDay: 25,
    purchasesPerMonth: 58,
    subscriptions: [
      SUBSCRIPTION.NETFLIX,
      SUBSCRIPTION.SPOTIFY,
      SUBSCRIPTION.GYM,
      SUBSCRIPTION.MOBILE,
      SUBSCRIPTION.WATER,
      SUBSCRIPTION.GAS,
      SUBSCRIPTION.HOME_INSURANCE,
    ],
    historyMonths: 24,
    demonstrates: 'High volume across every category. The stress case for insights and statements.',
  },
  {
    key: 'business',
    firstName: 'Priya',
    lastName: 'Raghavan',
    email: 'priya.raghavan@example.com',
    phone: '+447700900105',
    segment: CustomerSegment.BUSINESS,
    kycTier: 3,
    accounts: [
      {
        productCode: 'BUSINESS_CURRENT',
        currency: GBP,
        nickname: 'Meridian Design Ltd',
        openingMinor: 2_460_000,
      },
      { productCode: 'FX_WALLET', currency: 'USD', nickname: 'US clients', openingMinor: 780_000 },
    ],
    monthlySalaryMinor: 0,
    salaryDay: 1,
    purchasesPerMonth: 18,
    subscriptions: [SUBSCRIPTION.MOBILE],
    historyMonths: 20,
    demonstrates: 'Business banking, multi-currency, larger amounts.',
  },
  {
    key: 'saver',
    firstName: 'Eileen',
    lastName: 'Docherty',
    email: 'eileen.docherty@example.com',
    phone: '+447700900106',
    segment: CustomerSegment.PERSONAL,
    kycTier: 2,
    accounts: [
      { productCode: 'EVERYDAY_CURRENT', currency: GBP, openingMinor: 268_000 },
      {
        productCode: 'RELIANCE_SAVER',
        currency: GBP,
        nickname: 'Retirement top-up',
        openingMinor: 4_120_000,
      },
    ],
    monthlySalaryMinor: 192_000,
    salaryDay: 12,
    purchasesPerMonth: 12,
    subscriptions: [SUBSCRIPTION.WATER, SUBSCRIPTION.GAS, SUBSCRIPTION.HOME_INSURANCE],
    historyMonths: 24,
    // A large savings balance is the only way tiered interest is visible at all: the top
    // rate band never engages on a balance that stays under the first threshold.
    demonstrates: 'Large balance, low spend. The one that shows tiered interest working.',
  },
  {
    key: 'dormant',
    firstName: 'Callum',
    lastName: 'Reid',
    email: 'callum.reid@example.com',
    phone: '+447700900107',
    segment: CustomerSegment.PERSONAL,
    kycTier: 1,
    accounts: [{ productCode: 'EVERYDAY_CURRENT', currency: GBP, openingMinor: 43_700 }],
    monthlySalaryMinor: 0,
    salaryDay: 1,
    purchasesPerMonth: 0,
    subscriptions: [],
    historyMonths: 2,
    demonstrates: 'No activity for a year. What the dormancy job is supposed to find.',
  },
  {
    key: 'newcomer',
    firstName: 'Lena',
    lastName: 'Petrova',
    email: 'lena.petrova@example.com',
    phone: '+447700900108',
    segment: CustomerSegment.PERSONAL,
    kycTier: 0,
    accounts: [],
    monthlySalaryMinor: 0,
    salaryDay: 1,
    purchasesPerMonth: 0,
    subscriptions: [],
    historyMonths: 0,
    // Every empty state in the product is reachable through this one account.
    demonstrates: 'Registered, not yet verified. Exercises the KYC queue and every empty state.',
  },
]);

/**
 * The shared credential for generated customers, printed to the terminal by
 * `pnpm demo:reset`. A fixture for throwaway local accounts — never a real secret, and
 * never used by anything that reaches a network.
 */
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- local fixture, printed to stdout
export const PERSONA_PASSWORD = 'Reliance-Showcase-2026';
