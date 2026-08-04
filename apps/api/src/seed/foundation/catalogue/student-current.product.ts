import { AccountType, FeeKind, type Product } from '@reliance/contracts';

import { band, caps, fee, product, Tier } from './catalogue-builders.js';

/**
 * Student Current — a current account for someone in full-time education.
 *
 * The limits are the interesting part. They are markedly lower than the adult account's,
 * not because a student is less trusted but because this cohort is the most heavily
 * targeted by money-mule recruitment, and a £2,000 daily transfer ceiling makes an account
 * a poor laundering vehicle while remaining far above what a student actually moves.
 *
 * The arranged overdraft is interest-free. It is a real cost to the bank and is treated as
 * acquisition spend: the account is opened at eighteen and kept for thirty years.
 */
export const STUDENT_CURRENT: Product = product({
  code: 'STUDENT_CURRENT',
  name: 'Student Current',
  tagline: 'An interest-free overdraft and no monthly fee, for your whole course',
  description:
    'A current account for full-time students, with an interest-free arranged overdraft that ' +
    'grows each academic year, no monthly fee, and no charge for spending abroad. Available ' +
    'with proof of enrolment on a course of at least one year.',
  accountType: AccountType.CURRENT,
  minKycTier: 1,
  creditInterestTiers: [band({ from: '0', to: '300000', annualRateBps: 250 })],
  debitInterestBps: 0,
  fees: [
    fee({ kind: FeeKind.MONTHLY_MAINTENANCE, label: 'Monthly account fee' }),
    fee({ kind: FeeKind.ATM_DOMESTIC, label: 'Cash withdrawal in the UK' }),
    fee({
      kind: FeeKind.ATM_INTERNATIONAL,
      label: 'Cash withdrawal abroad',
      flat: '150',
      min: '150',
      max: '300',
      free: 3,
      waivedFor: [Tier.STUDENT],
    }),
    fee({ kind: FeeKind.DOMESTIC_TRANSFER, label: 'Transfer to a UK account' }),
    fee({
      kind: FeeKind.INTERNATIONAL_TRANSFER,
      label: 'International transfer',
      flat: '800',
      rateBps: 25,
      min: '800',
      max: '2500',
    }),
    fee({ kind: FeeKind.FX_MARKUP, label: 'Currency conversion', rateBps: 0 }),
    fee({ kind: FeeKind.CARD_ISSUANCE, label: 'Your first debit card' }),
    fee({ kind: FeeKind.CARD_REPLACEMENT, label: 'Replacement debit card', flat: '300', free: 1 }),
    fee({ kind: FeeKind.RETURNED_PAYMENT, label: 'Payment returned unpaid', flat: '500' }),
    fee({
      kind: FeeKind.UNARRANGED_OVERDRAFT,
      label: 'Going beyond your arranged overdraft',
      flat: '500',
      max: '2000',
    }),
    fee({ kind: FeeKind.STATEMENT_COPY, label: 'Paper copy of a statement', flat: '500', free: 2 }),
    fee({ kind: FeeKind.ACCOUNT_CLOSURE, label: 'Closing your account' }),
  ],
  limits: {
    internalTransfer: caps({
      perTransaction: '500000',
      daily: '500000',
      monthly: '2000000',
      dailyCount: 30,
    }),
    domesticTransfer: caps({
      perTransaction: '100000',
      daily: '200000',
      monthly: '1000000',
      dailyCount: 10,
    }),
    internationalTransfer: caps({
      perTransaction: '100000',
      daily: '100000',
      monthly: '500000',
      dailyCount: 2,
    }),
    cardSpend: caps({
      perTransaction: '100000',
      daily: '200000',
      monthly: '1000000',
      dailyCount: 40,
    }),
    atmWithdrawal: caps({
      perTransaction: '30000',
      daily: '30000',
      monthly: '200000',
      dailyCount: 4,
    }),
  },
  features: [
    'Interest-free arranged overdraft, up to £2,000 by your final year',
    'No fee to spend or convert currency abroad',
    'Free UK transfers and no monthly fee',
    'Budgeting built around termly maintenance payments',
    'Keep the account for a year after you graduate',
  ],
});
