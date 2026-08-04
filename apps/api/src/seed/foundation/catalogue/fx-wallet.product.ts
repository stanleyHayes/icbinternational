import { AccountType, FeeKind, type Product } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { caps, fee, FORBIDDEN, product, Tier } from './catalogue-builders.js';

/**
 * FX Wallet — a multi-currency balance for spending and holding abroad.
 *
 * Pays no credit interest at all, deliberately. The bank's margin here is the conversion
 * spread, and paying interest on a balance held to be spent would price the product twice.
 * A customer who wants a return on foreign currency should hold it and be told so, rather
 * than be quietly given a worse rate to fund an interest line.
 *
 * Every fee is denominated in sterling. The fee engine refuses to convert a fee currency
 * it was not given a rate for, which is the correct behaviour: the FX module owns rates,
 * and the catalogue must not invent one.
 */
const WALLET_CURRENCIES: readonly CurrencyCode[] = [
  'GBP',
  'USD',
  'EUR',
  'CHF',
  'JPY',
  'CAD',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'AED',
  'ZAR',
  'NGN',
  'GHS',
  'KES',
  'INR',
];

export const FX_WALLET: Product = product({
  code: 'FX_WALLET',
  name: 'FX Wallet',
  tagline: 'Hold and spend sixteen currencies at the real rate',
  description:
    'Hold balances in sixteen currencies, convert between them at the interbank rate plus a ' +
    'flat 0.45%, and spend with a card that pays from the matching balance automatically. No ' +
    'monthly fee, no minimum balance, and no charge to receive.',
  accountType: AccountType.FX_WALLET,
  currencies: WALLET_CURRENCIES,
  minKycTier: 2,
  fees: [
    fee({ kind: FeeKind.MONTHLY_MAINTENANCE, label: 'Monthly account fee' }),
    fee({
      kind: FeeKind.FX_MARKUP,
      label: 'Currency conversion',
      rateBps: 45,
      waivedFor: [Tier.PREMIER],
    }),
    fee({
      kind: FeeKind.ATM_INTERNATIONAL,
      label: 'Cash withdrawal abroad',
      flat: '200',
      rateBps: 175,
      min: '200',
      max: '800',
      free: 3,
      waivedFor: [Tier.PREMIER],
    }),
    fee({
      kind: FeeKind.INTERNATIONAL_TRANSFER,
      label: 'Sending money abroad',
      flat: '500',
      rateBps: 15,
      min: '500',
      max: '2500',
    }),
    fee({ kind: FeeKind.CARD_ISSUANCE, label: 'Your multi-currency card' }),
    fee({ kind: FeeKind.CARD_REPLACEMENT, label: 'Replacement card', flat: '600' }),
    fee({ kind: FeeKind.ACCOUNT_CLOSURE, label: 'Closing your wallet' }),
  ],
  creditInterestTiers: [],
  limits: {
    internalTransfer: caps({
      perTransaction: '5000000',
      daily: '10000000',
      monthly: '50000000',
      dailyCount: 40,
    }),
    domesticTransfer: FORBIDDEN,
    internationalTransfer: caps({
      perTransaction: '2500000',
      daily: '2500000',
      monthly: '10000000',
      dailyCount: 10,
    }),
    cardSpend: caps({
      perTransaction: '500000',
      daily: '1000000',
      monthly: '5000000',
      dailyCount: 60,
    }),
    atmWithdrawal: caps({
      perTransaction: '50000',
      daily: '75000',
      monthly: '750000',
      dailyCount: 5,
    }),
  },
  features: [
    'Sixteen currencies in one account',
    'Interbank rate plus 0.45%, shown before you convert',
    'Card spends from the matching balance, or converts if there is none',
    'Lock a rate for 60 seconds before you commit',
    'Free to receive in any supported currency',
  ],
});
