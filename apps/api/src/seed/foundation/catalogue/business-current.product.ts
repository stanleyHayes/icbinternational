import { AccountType, FeeKind, type Product } from '@reliance/contracts';

import { band, caps, fee, product, Tier } from './catalogue-builders.js';

/**
 * Business Current — a current account for a limited company or sole trader.
 *
 * Priced the opposite way round from the retail account: a monthly fee buys headroom.
 * Business payment volumes are an order of magnitude higher and far less predictable, so
 * the bank charges for the capacity rather than for each payment, and the limits are set
 * where a genuine payroll run fits and a compromised login does not.
 *
 * KYC tier 3 is required because a business relationship needs beneficial-ownership
 * evidence, not just an identity document.
 */
export const BUSINESS_CURRENT: Product = product({
  code: 'BUSINESS_CURRENT',
  name: 'Business Current',
  tagline: 'Banking that keeps up with the business',
  description:
    'A current account for limited companies and sole traders, with multi-user access, ' +
    'payment approvals, bulk payroll runs and invoice matching. £9.50 a month covers your ' +
    'first 200 payments; accounting software connects out of the box.',
  accountType: AccountType.BUSINESS,
  minKycTier: 3,
  minOpeningBalance: '10000',
  monthlyFee: '950',
  creditInterestTiers: [
    band({ from: '0', to: '5000000', annualRateBps: 175 }),
    band({ from: '5000000', to: '25000000', annualRateBps: 225 }),
    band({ from: '25000000', annualRateBps: 275 }),
  ],
  debitInterestBps: 1290,
  fees: [
    fee({
      kind: FeeKind.MONTHLY_MAINTENANCE,
      label: 'Monthly account fee',
      flat: '950',
      waivedFor: [Tier.BUSINESS_PLUS],
    }),
    fee({ kind: FeeKind.ATM_DOMESTIC, label: 'Cash withdrawal in the UK', flat: '100', free: 10 }),
    fee({
      kind: FeeKind.ATM_INTERNATIONAL,
      label: 'Cash withdrawal abroad',
      flat: '250',
      rateBps: 200,
      min: '250',
      max: '1000',
    }),
    fee({
      kind: FeeKind.DOMESTIC_TRANSFER,
      label: 'Transfer to a UK account',
      flat: '25',
      free: 200,
      waivedFor: [Tier.BUSINESS_PLUS],
    }),
    fee({
      kind: FeeKind.INTERNATIONAL_TRANSFER,
      label: 'International transfer',
      flat: '1500',
      rateBps: 20,
      min: '1500',
      max: '6000',
    }),
    fee({ kind: FeeKind.FX_MARKUP, label: 'Currency conversion', rateBps: 175 }),
    fee({ kind: FeeKind.CARD_ISSUANCE, label: 'Company debit card', flat: '500', free: 2 }),
    fee({ kind: FeeKind.CARD_REPLACEMENT, label: 'Replacement company card', flat: '750' }),
    fee({ kind: FeeKind.RETURNED_PAYMENT, label: 'Payment returned unpaid', flat: '1500' }),
    fee({
      kind: FeeKind.UNARRANGED_OVERDRAFT,
      label: 'Going overdrawn without an arrangement',
      flat: '2500',
      max: '15000',
    }),
    fee({ kind: FeeKind.LATE_PAYMENT, label: 'Late repayment of a facility', flat: '2500' }),
    fee({ kind: FeeKind.STATEMENT_COPY, label: 'Paper copy of a statement', flat: '500', free: 2 }),
    fee({ kind: FeeKind.ACCOUNT_CLOSURE, label: 'Closing your account' }),
  ],
  limits: {
    internalTransfer: caps({
      perTransaction: '25000000',
      daily: '50000000',
      monthly: '250000000',
      dailyCount: 200,
    }),
    domesticTransfer: caps({
      perTransaction: '10000000',
      daily: '25000000',
      monthly: '100000000',
      dailyCount: 200,
    }),
    internationalTransfer: caps({
      perTransaction: '5000000',
      daily: '10000000',
      monthly: '50000000',
      dailyCount: 25,
    }),
    cardSpend: caps({
      perTransaction: '2500000',
      daily: '5000000',
      monthly: '25000000',
      dailyCount: 100,
    }),
    atmWithdrawal: caps({
      perTransaction: '100000',
      daily: '200000',
      monthly: '2000000',
      dailyCount: 10,
    }),
  },
  features: [
    'Up to ten users, each with their own permissions',
    'Two-person approval on payments above a threshold you set',
    'Bulk payroll from a single upload',
    'Invoices raised, sent and matched to incoming payments',
    'Export to Xero, QuickBooks or CSV',
    '200 free UK payments a month, then 25p each',
  ],
});
