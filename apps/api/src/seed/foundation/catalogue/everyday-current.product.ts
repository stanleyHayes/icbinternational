import { AccountType, FeeKind, type Product } from '@reliance/contracts';

import { band, caps, fee, product, Tier } from './catalogue-builders.js';

/**
 * Everyday Current — the bank's default retail current account.
 *
 * Free to run, because the account exists to hold the relationship; the bank earns on the
 * balance and on the unarranged-overdraft and international charges below rather than on
 * a monthly fee. Credit interest is tiered downwards so a large balance is not subsidised
 * at the headline rate — the headline rate is what attracts the first £2,500.
 */
export const EVERYDAY_CURRENT: Product = product({
  code: 'EVERYDAY_CURRENT',
  name: 'Everyday Current',
  tagline: 'Your day-to-day account, with no monthly fee',
  description:
    'A full-featured current account with a contactless debit card, instant notifications, ' +
    'free UK transfers and interest paid monthly on your balance. No monthly fee, no minimum ' +
    'balance, and an arranged overdraft available once your account is three months old.',
  accountType: AccountType.CURRENT,
  minKycTier: 1,
  creditInterestTiers: [
    band({ from: '0', to: '250000', annualRateBps: 300 }),
    band({ from: '250000', to: '1000000', annualRateBps: 150 }),
    band({ from: '1000000', annualRateBps: 50 }),
  ],
  debitInterestBps: 3990,
  fees: [
    fee({ kind: FeeKind.MONTHLY_MAINTENANCE, label: 'Monthly account fee' }),
    fee({ kind: FeeKind.ATM_DOMESTIC, label: 'Cash withdrawal in the UK' }),
    fee({
      kind: FeeKind.ATM_INTERNATIONAL,
      label: 'Cash withdrawal abroad',
      flat: '150',
      rateBps: 200,
      min: '150',
      max: '600',
      free: 2,
      waivedFor: [Tier.PREMIER],
    }),
    fee({ kind: FeeKind.DOMESTIC_TRANSFER, label: 'Transfer to a UK account' }),
    fee({
      kind: FeeKind.INTERNATIONAL_TRANSFER,
      label: 'International transfer',
      flat: '1200',
      rateBps: 25,
      min: '1200',
      max: '4000',
      waivedFor: [Tier.PREMIER],
    }),
    fee({ kind: FeeKind.FX_MARKUP, label: 'Currency conversion', rateBps: 275 }),
    fee({ kind: FeeKind.CARD_ISSUANCE, label: 'Your first debit card' }),
    fee({ kind: FeeKind.CARD_REPLACEMENT, label: 'Replacement debit card', flat: '600' }),
    fee({ kind: FeeKind.RETURNED_PAYMENT, label: 'Payment returned unpaid', flat: '1000' }),
    fee({
      kind: FeeKind.UNARRANGED_OVERDRAFT,
      label: 'Going overdrawn without an arrangement',
      flat: '1500',
      max: '8000',
    }),
    fee({ kind: FeeKind.STATEMENT_COPY, label: 'Paper copy of a statement', flat: '500', free: 1 }),
    fee({ kind: FeeKind.ACCOUNT_CLOSURE, label: 'Closing your account' }),
  ],
  limits: {
    internalTransfer: caps({
      perTransaction: '2500000',
      daily: '5000000',
      monthly: '25000000',
      dailyCount: 50,
    }),
    domesticTransfer: caps({
      perTransaction: '2500000',
      daily: '2500000',
      monthly: '10000000',
      dailyCount: 20,
    }),
    internationalTransfer: caps({
      perTransaction: '1000000',
      daily: '1000000',
      monthly: '5000000',
      dailyCount: 5,
    }),
    cardSpend: caps({
      perTransaction: '500000',
      daily: '1000000',
      monthly: '5000000',
      dailyCount: 60,
    }),
    atmWithdrawal: caps({
      perTransaction: '50000',
      daily: '50000',
      monthly: '500000',
      dailyCount: 6,
    }),
  },
  features: [
    'Contactless debit card, in your hands in three working days',
    'Instant notifications for every payment',
    'Free transfers to any UK bank',
    'Interest paid monthly, tiered from 3.00% AER',
    'Round-ups and savings goals built in',
    'Freeze and unfreeze your card in the app',
  ],
});
