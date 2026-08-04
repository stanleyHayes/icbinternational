import type { MetadataRoute } from 'next';

import { APP_URL } from '@/lib/env';

/**
 * Crawler directives for the banking host.
 *
 * Nothing here is indexable. Every page is behind authentication, and the two that are not
 * — sign-in and the onboarding funnel — are not answers to anything anyone searched for.
 * `reliancebank.example` is where the bank is found; this host is where it is used.
 *
 * The `robots` meta tag in the root layout says the same thing, and both are kept: the tag
 * is authoritative for a page a crawler has already fetched, this file stops it fetching
 * one at all. A crawler that ignores the tag on a signed-in page has already been served
 * that page.
 *
 * No sitemap is published, for the same reason — there is nothing to submit.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
    host: APP_URL,
  };
}
