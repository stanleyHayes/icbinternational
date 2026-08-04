import { AccountType, FeeKind, type Product } from '@reliance/contracts';

import { band, caps, fee, FORBIDDEN, product } from './catalogue-builders.js';

/**
 * Reliance Saver — an instant-access savings account.
 *
 * Interest is tiered *upwards* here, the opposite of the current account: a saver is
 * rewarded for consolidating, whereas a current account's headline rate exists to win the
 * relationship. The account has no card and cannot pay a third party; money leaves only to
 * an account the same customer already holds, which is what keeps it out of the fraud path
 * and lets the limits be generous.
 */
export const RELIANCE_SAVER: Product = product({
  code: 'RELIANCE_SAVER',
  name: 'Reliance Saver',
  tagline: 'Instant access, interest that grows with your balance',
  description:
    'A savings account you can draw on the same day, with interest paid monthly and rates ' +
    'that rise as your balance does. Transfers in and out are limited to your own Reliance ' +
    'accounts, which is what keeps the account safe and the rates high.',
  accountType: AccountType.SAVINGS,
  minKycTier: 1,
  minOpeningBalance: '100',
  creditInterestTiers: [
    band({ from: '0', to: '500000', annualRateBps: 400 }),
    band({ from: '500000', to: '2500000', annualRateBps: 450 }),
    band({ from: '2500000', to: '10000000', annualRateBps: 475 }),
    band({ from: '10000000', annualRateBps: 500 }),
  ],
  fees: [
    fee({ kind: FeeKind.MONTHLY_MAINTENANCE, label: 'Monthly account fee' }),
    fee({ kind: FeeKind.STATEMENT_COPY, label: 'Paper copy of a statement', flat: '500', free: 1 }),
    fee({ kind: FeeKind.ACCOUNT_CLOSURE, label: 'Closing your account' }),
  ],
  limits: {
    internalTransfer: caps({
      perTransaction: '10000000',
      daily: '10000000',
      monthly: '50000000',
      dailyCount: 20,
    }),
    domesticTransfer: FORBIDDEN,
    internationalTransfer: FORBIDDEN,
    cardSpend: FORBIDDEN,
    atmWithdrawal: FORBIDDEN,
  },
  features: [
    'Withdraw to your current account the same day',
    'Interest paid on the first of every month',
    'Rates from 4.00% to 5.00% AER, tiered by balance',
    'No notice period and no withdrawal penalty',
    'Set a goal and watch the projection update as you save',
  ],
});
