import {
  type AccountType,
  type FeeKind,
  type FeeScheduleEntry,
  type InterestTier,
  type LimitMatrix,
  type Money as WireMoney,
  type Product,
} from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { FOUNDATION_EFFECTIVE_FROM, SEED_CURRENCY } from '../../seed.constants.js';

/**
 * Builders for the foundation product catalogue.
 *
 * Every builder takes an options object rather than positional arguments. That is not
 * only about readability: a bare `250` passed as a third argument is a magic number, and
 * `{ annualRateBps: 250 }` is a labelled fact. The catalogue is specification data, so it
 * should read like a rate card and not like a function call.
 *
 * Amounts are given in minor units as strings — `'250000'` is £2,500.00 — because that is
 * exactly how they are stored and how they travel, with no decimal point anywhere near
 * them to round.
 */

/** Sterling, the currency the whole foundation catalogue is priced in. */
export const CATALOGUE_CURRENCY = SEED_CURRENCY as CurrencyCode;

/** Customer pricing tiers a fee may be waived for. */
export const Tier = {
  STUDENT: 'STUDENT',
  PREMIER: 'PREMIER',
  BUSINESS_PLUS: 'BUSINESS_PLUS',
} as const;

/** A sterling amount from its minor units, e.g. `money('1250')` is £12.50. */
export function money(minorUnits: string): WireMoney {
  return { amount: minorUnits, currency: CATALOGUE_CURRENCY };
}

/** Free of charge. Named because "£0.00" appears throughout a fee schedule. */
export const FREE = money('0');

/** An optional sterling amount, so a builder can take `undefined` for "not configured". */
function optionalMoney(minorUnits: string | undefined): WireMoney | null {
  return minorUnits === undefined ? null : money(minorUnits);
}

/** One line of a fee schedule. Omitted components are null, meaning "does not apply". */
export function fee(options: {
  kind: FeeKind;
  label: string;
  /** Flat component in minor units. */
  flat?: string;
  /** Proportional component in basis points. */
  rateBps?: number;
  /** Floor after both components are summed. */
  min?: string;
  /** Cap after the floor. */
  max?: string;
  /** Uses per calendar month before the fee bites. */
  free?: number;
  waivedFor?: readonly string[];
}): FeeScheduleEntry {
  return {
    kind: options.kind,
    label: options.label,
    flatAmount: optionalMoney(options.flat),
    rateBps: options.rateBps ?? null,
    minAmount: optionalMoney(options.min),
    maxAmount: optionalMoney(options.max),
    freeAllowancePerMonth: options.free ?? 0,
    waivedForTiers: [...(options.waivedFor ?? [])],
  };
}

/** One credit-interest band. `to` omitted means the band is the unbounded top one. */
export function band(options: { from: string; to?: string; annualRateBps: number }): InterestTier {
  return {
    fromAmount: money(options.from),
    toAmount: optionalMoney(options.to),
    annualRateBps: options.annualRateBps,
  };
}

/** One limit dimension. An omitted cap is uncapped, not zero. */
export function caps(options: {
  perTransaction?: string;
  daily?: string;
  monthly?: string;
  dailyCount?: number;
}): LimitMatrix {
  return {
    perTransaction: optionalMoney(options.perTransaction),
    daily: optionalMoney(options.daily),
    monthly: optionalMoney(options.monthly),
    dailyCount: options.dailyCount ?? null,
  };
}

/** No movement of this kind is permitted at all. */
export const FORBIDDEN: LimitMatrix = {
  perTransaction: FREE,
  daily: FREE,
  monthly: FREE,
  dailyCount: 0,
};

/** The five limit dimensions of a product. */
export interface LimitSet {
  internalTransfer: LimitMatrix;
  domesticTransfer: LimitMatrix;
  internationalTransfer: LimitMatrix;
  cardSpend: LimitMatrix;
  atmWithdrawal: LimitMatrix;
}

/** Fields a foundation product must state; the rest are catalogue-wide defaults. */
export interface ProductDefinition {
  code: string;
  name: string;
  tagline: string;
  description: string;
  accountType: AccountType;
  currencies?: readonly CurrencyCode[];
  minKycTier: number;
  minOpeningBalance?: string;
  minBalance?: string;
  monthlyFee?: string;
  creditInterestTiers: readonly InterestTier[];
  debitInterestBps?: number;
  fees: readonly FeeScheduleEntry[];
  limits: LimitSet;
  features: readonly string[];
}

/**
 * Completes a definition into the contract shape.
 *
 * Version 1 and a fixed effective date for every foundation product: the catalogue is the
 * bank's opening position, not a reprice, and giving it today's date would mean an account
 * the persona generator opens eighteen months ago has no product terms to be priced by.
 */
export function product(definition: ProductDefinition): Product {
  return {
    code: definition.code,
    version: FOUNDATION_VERSION,
    name: definition.name,
    tagline: definition.tagline,
    description: definition.description,
    accountType: definition.accountType,
    currencies: [...(definition.currencies ?? [CATALOGUE_CURRENCY])],
    minKycTier: definition.minKycTier,
    minOpeningBalance: money(definition.minOpeningBalance ?? NO_MINOR_UNITS),
    minBalance: money(definition.minBalance ?? NO_MINOR_UNITS),
    monthlyFee: money(definition.monthlyFee ?? NO_MINOR_UNITS),
    creditInterestTiers: [...definition.creditInterestTiers],
    debitInterestBps: definition.debitInterestBps ?? null,
    fees: [...definition.fees],
    limits: { ...definition.limits },
    features: [...definition.features],
    active: true,
    effectiveFrom: FOUNDATION_EFFECTIVE_FROM,
    effectiveTo: null,
  };
}

const FOUNDATION_VERSION = 1;
const NO_MINOR_UNITS = '0';
