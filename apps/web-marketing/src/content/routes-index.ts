/**
 * Every static page on the site, with the priority and refresh cadence a crawler should
 * assume. Kept beside the navigation rather than derived from the filesystem: a page that
 * exists but should not be indexed (a funnel step, a thank-you) must be an explicit
 * decision, not an accident of where a file happens to sit.
 */

import type { SiteHref } from '@/lib/routes';

/** How often the page's content actually changes. Honest values; crawlers notice lies. */
export type ChangeFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** One indexable page. */
export interface IndexedRoute {
  readonly path: SiteHref;
  readonly changeFrequency: ChangeFrequency;
  /** 1.0 is the home page; nothing else reaches it. */
  readonly priority: number;
}

const HOME_PRIORITY = 1;
const PRODUCT_PRIORITY = 0.9;
const SUPPORTING_PRIORITY = 0.7;
const CORPORATE_PRIORITY = 0.5;
const LEGAL_PRIORITY = 0.3;

export const INDEXED_ROUTES = [
  { path: '/', changeFrequency: 'weekly', priority: HOME_PRIORITY },
  { path: '/personal', changeFrequency: 'monthly', priority: PRODUCT_PRIORITY },
  { path: '/personal/current-accounts', changeFrequency: 'monthly', priority: PRODUCT_PRIORITY },
  { path: '/personal/cards', changeFrequency: 'monthly', priority: PRODUCT_PRIORITY },
  { path: '/savings', changeFrequency: 'weekly', priority: PRODUCT_PRIORITY },
  { path: '/business', changeFrequency: 'monthly', priority: PRODUCT_PRIORITY },
  { path: '/borrow/loans', changeFrequency: 'weekly', priority: PRODUCT_PRIORITY },
  { path: '/borrow/mortgages', changeFrequency: 'weekly', priority: PRODUCT_PRIORITY },
  { path: '/borrow/overdrafts', changeFrequency: 'monthly', priority: SUPPORTING_PRIORITY },
  { path: '/rates-and-fees', changeFrequency: 'daily', priority: PRODUCT_PRIORITY },
  { path: '/open-an-account', changeFrequency: 'monthly', priority: PRODUCT_PRIORITY },
  { path: '/branches', changeFrequency: 'weekly', priority: SUPPORTING_PRIORITY },
  { path: '/help', changeFrequency: 'weekly', priority: SUPPORTING_PRIORITY },
  { path: '/security', changeFrequency: 'monthly', priority: SUPPORTING_PRIORITY },
  { path: '/security/fraud', changeFrequency: 'weekly', priority: SUPPORTING_PRIORITY },
  { path: '/contact', changeFrequency: 'monthly', priority: SUPPORTING_PRIORITY },
  { path: '/insights', changeFrequency: 'weekly', priority: SUPPORTING_PRIORITY },
  { path: '/about', changeFrequency: 'monthly', priority: CORPORATE_PRIORITY },
  { path: '/careers', changeFrequency: 'weekly', priority: CORPORATE_PRIORITY },
  { path: '/accessibility', changeFrequency: 'yearly', priority: LEGAL_PRIORITY },
  { path: '/legal/terms', changeFrequency: 'yearly', priority: LEGAL_PRIORITY },
  { path: '/legal/privacy', changeFrequency: 'yearly', priority: LEGAL_PRIORITY },
  { path: '/legal/cookies', changeFrequency: 'yearly', priority: LEGAL_PRIORITY },
] as const satisfies readonly IndexedRoute[];
