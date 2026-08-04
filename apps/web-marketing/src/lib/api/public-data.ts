/**
 * Everything the site reads from the bank, in one place. **Server-side only.**
 *
 * Each loader is wrapped in React's `cache`, so a page that shows the savings rate in the
 * hero and again in a comparison table fetches it once per render pass. The pages are
 * static, so in practice each of these runs a handful of times for the whole build.
 */

import { cache } from 'react';

import { ApiClientError, type PublicRates } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';
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

/** Headline savings and lending rates, with the date they took effect. */
export const getRates = cache(async (): Promise<PublicRates> => {
  const { data } = await publicApi().public.rates();
  return data;
});

/** The FX board, as shown on the multi-currency pages. */
export const getFxBoard = cache(async (): Promise<FxBoard> => {
  const { data } = await publicApi().public.fxBoard();
  return data;
});

/** The published fee schedule. */
export const getFees = cache(async (): Promise<readonly FeeScheduleEntry[]> => {
  const { data } = await publicApi().public.fees({ limit: CATALOGUE_PAGE_SIZE });
  return data;
});

/** The product catalogue, as the marketing site shows it. */
export const getProducts = cache(async (): Promise<readonly Product[]> => {
  const { data } = await publicApi().public.products({ limit: CATALOGUE_PAGE_SIZE });
  return data;
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
  const { data } = await publicApi().public.locations({
    limit: CATALOGUE_PAGE_SIZE,
    radiusMetres: DEFAULT_RADIUS_METRES,
  });
  return data;
});

/**
 * Published FAQs, de-duplicated by question.
 *
 * The catalogue is paged and can repeat an entry across pages; showing the same question
 * twice in a help centre reads as a fault in the help centre.
 */
export const getFaqs = cache(async (): Promise<readonly Faq[]> => {
  const { data } = await publicApi().public.faqs({ limit: CATALOGUE_PAGE_SIZE });
  const seen = new Set<string>();

  return data.filter((faq) => {
    if (seen.has(faq.question)) return false;
    seen.add(faq.question);
    return true;
  });
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
    throw error;
  }
});
