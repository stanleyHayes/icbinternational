/**
 * Everything the site reads from the bank, in one place. **Server-side only.**
 *
 * Each loader is wrapped in React's `cache`, so a page that shows the savings rate in the
 * hero and again in a comparison table fetches it once per render pass. The pages are
 * static, so in practice each of these runs a handful of times for the whole build.
 */

import { cache } from 'react';

import { ApiClientError, type PublicRates } from '@reliance/api-client';
import { AccountType, ErrorCode } from '@reliance/contracts';
import type {
  BankLocation,
  CmsPage,
  Faq,
  FeeScheduleEntry,
  FxBoard,
  Product,
} from '@reliance/contracts';

import { publicApi } from './client';

/** The catalogue is four products; the fee schedule is six lines. One page holds both. */
const CATALOGUE_PAGE_SIZE = 50;

const shouldUseFallback = () => process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'production';

async function withFallback<T>(request: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (shouldUseFallback()) {
      return fallback;
    }

    throw error;
  }
}

const FALLBACK_PRODUCTS: readonly Product[] = [
  {
    code: 'current-account',
    version: 1,
    name: 'Current Account',
    tagline: 'Everyday banking with no monthly fee',
    description: 'A flexible current account for day-to-day spending and incoming payments.',
    accountType: AccountType.CURRENT,
    currencies: ['GBP'],
    minKycTier: 0,
    minOpeningBalance: { amount: '0', currency: 'GBP' },
    minBalance: { amount: '0', currency: 'GBP' },
    monthlyFee: { amount: '0', currency: 'GBP' },
    creditInterestTiers: [],
    debitInterestBps: null,
    fees: [],
    limits: {
      internalTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      domesticTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      internationalTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      cardSpend: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      atmWithdrawal: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
    },
    features: ['No monthly fee', 'Instant card issuing', 'Mobile app support'],
    active: true,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
  },
  {
    code: 'savings-account',
    version: 1,
    name: 'Savings Account',
    tagline: 'Grow your balance with easy access',
    description: 'A simple savings account that helps your money work harder without locking it away.',
    accountType: AccountType.SAVINGS,
    currencies: ['GBP'],
    minKycTier: 0,
    minOpeningBalance: { amount: '0', currency: 'GBP' },
    minBalance: { amount: '0', currency: 'GBP' },
    monthlyFee: { amount: '0', currency: 'GBP' },
    creditInterestTiers: [],
    debitInterestBps: null,
    fees: [],
    limits: {
      internalTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      domesticTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      internationalTransfer: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      cardSpend: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
      atmWithdrawal: { perTransaction: null, daily: null, monthly: null, dailyCount: null },
    },
    features: ['Competitive interest', 'Easy transfers', 'Protected deposits'],
    active: true,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
  },
] as const;

const FALLBACK_RATES: PublicRates = {
  savings: [],
  lending: [],
  effectiveFrom: '2024-01-01',
  asOf: '2024-01-01T00:00:00.000Z',
};

const FALLBACK_FX_BOARD: FxBoard = {
  base: 'GBP',
  asOf: '2024-01-01T00:00:00.000Z',
  rates: [],
};

const FALLBACK_FEES: readonly FeeScheduleEntry[] = [];
const FALLBACK_LOCATIONS: readonly BankLocation[] = [];
const FALLBACK_FAQS: readonly Faq[] = [];

/** Headline savings and lending rates, with the date they took effect. */
export const getRates = cache(async (): Promise<PublicRates> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.rates();
    return data;
  }, FALLBACK_RATES);
});

/** The FX board, as shown on the multi-currency pages. */
export const getFxBoard = cache(async (): Promise<FxBoard> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.fxBoard();
    return data;
  }, FALLBACK_FX_BOARD);
});

/** The published fee schedule. */
export const getFees = cache(async (): Promise<readonly FeeScheduleEntry[]> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.fees({ limit: CATALOGUE_PAGE_SIZE });
    return data;
  }, FALLBACK_FEES);
});

/** The product catalogue, as the marketing site shows it. */
export const getProducts = cache(async (): Promise<readonly Product[]> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.products({ limit: CATALOGUE_PAGE_SIZE });
    return data;
  }, FALLBACK_PRODUCTS);
});

/** One product by code, or `undefined` when it is not on sale. */
export async function getProduct(code: string): Promise<Product | undefined> {
  const products = await getProducts();
  return products.find((product) => product.code === code);
}

/**
 * The default proximity radius the contract applies when a search has no centre point.
 * The site lists every location and filters in the browser, so it is passed only to
 * satisfy the query schema.
 */
const DEFAULT_RADIUS_METRES = 25_000;

/** Branches and ATMs. */
export const getLocations = cache(async (): Promise<readonly BankLocation[]> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.locations({
      limit: CATALOGUE_PAGE_SIZE,
      radiusMetres: DEFAULT_RADIUS_METRES,
    });
    return data;
  }, FALLBACK_LOCATIONS);
});

/**
 * Published FAQs, de-duplicated by question.
 *
 * The catalogue is paged and can repeat an entry across pages; showing the same question
 * twice in a help centre reads as a fault in the help centre.
 */
export const getFaqs = cache(async (): Promise<readonly Faq[]> => {
  return withFallback(async () => {
    const { data } = await publicApi().public.faqs({ limit: CATALOGUE_PAGE_SIZE });
    const seen = new Set<string>();

    return data.filter((faq) => {
      if (seen.has(faq.question)) return false;
      seen.add(faq.question);
      return true;
    });
  }, FALLBACK_FAQS);
});

/**
 * A content-managed page's metadata, or `null` when nothing is published at that slug.
 *
 * The site owns its own layout and copy; what the CMS owns is the search-facing title and
 * description, so those can be revised without a deploy. A missing page is not an error —
 * the route still renders, it just falls back to the copy written here.
 */
export const getCmsPage = cache(async (slug: string): Promise<CmsPage | null> => {
  try {
    const { data } = await publicApi().public.page(slug);
    return data;
  } catch (error) {
    if (ApiClientError.isApiClientError(error) && error.is(ErrorCode.NOT_FOUND)) return null;
    if (shouldUseFallback()) return null;
    throw error;
  }
});
