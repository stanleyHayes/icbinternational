import type { MetadataRoute } from 'next';

import { CONSOLE_URL } from '@/lib/env';

/**
 * Crawler directives for the operations console.
 *
 * A blanket disallow. This is staff tooling behind authentication and there is no page on
 * this host anyone should reach from a search result.
 *
 * The `robots` meta tag in the root layout says the same thing, and both are kept: the tag
 * governs a page a crawler has already fetched, this file stops it fetching one at all.
 * Neither is a security control — the console is protected by the operator session, not by
 * asking politely — but a queue of customer names in a search index is a disclosure, and
 * this is the cheap half of preventing it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
    host: CONSOLE_URL,
  };
}
