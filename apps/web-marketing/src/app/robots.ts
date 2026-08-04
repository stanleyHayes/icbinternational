import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/content/site';

/**
 * Crawler directives.
 *
 * The account-opening funnel is disallowed: its steps are not landing pages, and a crawler
 * indexing step three sends people into the middle of an application with no context.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/open-an-account/apply'],
      },
    ],
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
    host: SITE_URL,
  };
}
