/**
 * The unauthenticated marketing surface.
 *
 * Nothing here reads customer data, and nothing here should ever be given a session. The
 * separation is a contract-level boundary, not a convention — see the header of
 * `packages/contracts/src/modules/content.ts`.
 */

import type { z } from 'zod';

import {
  acknowledgedSchema,
  articleSchema,
  cmsPageSchema,
  faqSchema,
  fxBoardSchema,
  loanQuoteSchema,
  locationSchema,
  paginated,
  productFeesSchema,
  productRatesSchema,
  productSchema,
  resource,
  routes,
  type Acknowledged,
  type Article,
  type BankLocation,
  type CmsPage,
  type CursorQuery,
  type Faq,
  type FxBoard,
  type LeadRequest,
  type LoanCalculationRequest,
  type LoanQuote,
  type LocationSearchQuery,
  type Paginated,
  type Product,
  type ProductFees,
  type ProductRates,
  type Resource,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import {
  savingsProjectionSchema,
  type SavingsCalculationRequest,
  type SavingsProjection,
} from '../provisional/operations.js';

const rateList = paginated(productRatesSchema);
const boardResource = resource(fxBoardSchema);
const feeList = paginated(productFeesSchema);
const productList = paginated(productSchema);
const locationList = paginated(locationSchema);
const pageResource = resource(cmsPageSchema);
const articleList = paginated(articleSchema);
const articleResource = resource(articleSchema);
const faqList = paginated(faqSchema);
const loanQuoteResource = resource(loanQuoteSchema);
const savingsResource = resource(savingsProjectionSchema);

type NewsletterRequest = { readonly email: string; readonly consent: true };

/** Filters for the public article list. */
export type ListPostsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly category?: string | undefined;
  readonly tag?: string | undefined;
};

/** Builds the `client.public` group. */
export function createPublicResource(http: HttpTransport) {
  return {
    /** Headline savings and lending rates. */
    rates: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<ProductRates>> =>
      http.get({ ...options, path: routes.public.rates, query, schema: rateList }),

    /** The public FX board. */
    fxBoard: (options?: QueryOptions): Promise<Resource<FxBoard>> =>
      http.get({ ...options, path: routes.public.fxBoard, schema: boardResource }),

    /** The published fee schedule. */
    fees: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<ProductFees>> =>
      http.get({ ...options, path: routes.public.fees, query, schema: feeList }),

    /** The product catalogue as the marketing site shows it. */
    products: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Product>> =>
      http.get({ ...options, path: routes.public.products, query, schema: productList }),

    /** Branches and ATMs, optionally near a point. */
    locations: (
      query?: LocationSearchQuery,
      options?: QueryOptions,
    ): Promise<Paginated<BankLocation>> =>
      http.get({ ...options, path: routes.public.locations, query, schema: locationList }),

    /** One CMS page by slug, as an ordered list of typed blocks. */
    page: (slug: string, options?: QueryOptions): Promise<Resource<CmsPage>> =>
      http.get({ ...options, path: routes.public.page(slug), schema: pageResource }),

    /** Published articles. */
    posts: (query?: ListPostsQuery, options?: QueryOptions): Promise<Paginated<Article>> =>
      http.get({ ...options, path: routes.public.posts, query, schema: articleList }),

    /** One article by slug. */
    post: (slug: string, options?: QueryOptions): Promise<Resource<Article>> =>
      http.get({ ...options, path: routes.public.post(slug), schema: articleResource }),

    /** Published FAQs. */
    faqs: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Faq>> =>
      http.get({ ...options, path: routes.public.faqs, query, schema: faqList }),

    /** Submits a sales enquiry. The `website` field is a honeypot — leave it empty. */
    submitLead: (body: LeadRequest, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({ ...options, path: routes.public.leads, body, schema: acknowledgedSchema }),

    /** Subscribes an address to the newsletter. */
    subscribeNewsletter: (
      body: NewsletterRequest,
      options?: MutationOptions,
    ): Promise<Acknowledged> =>
      http.post({ ...options, path: routes.public.newsletter, body, schema: acknowledgedSchema }),

    /** Illustrative loan repayments. No credit search, no record on any file. */
    loanCalculator: (
      body: LoanCalculationRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanQuote>> =>
      http.post({
        ...options,
        path: routes.public.loanCalculator,
        body,
        schema: loanQuoteResource,
      }),

    /** Illustrative savings growth. */
    savingsCalculator: (
      body: SavingsCalculationRequest,
      options?: MutationOptions,
    ): Promise<Resource<SavingsProjection>> =>
      http.post({
        ...options,
        path: routes.public.savingsCalculator,
        body,
        schema: savingsResource,
      }),
  };
}

/** The `client.public` group. */
export type PublicResource = ReturnType<typeof createPublicResource>;

/** The CMS block union, re-exported for renderers that switch on block type. */
export type ContentBlockType = z.infer<typeof cmsPageSchema>['blocks'][number]['type'];
