import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/content/site';

const DEFAULT_PRIORITY = 0.8;

const staticRoutes = [
  '/',
  '/about',
  '/accessibility',
  '/branches',
  '/borrow/loans',
  '/borrow/mortgages',
  '/borrow/overdrafts',
  '/business',
  '/careers',
  '/contact',
  '/help',
  '/insights',
  '/open-an-account',
  '/personal',
  '/personal/cards',
  '/personal/current-accounts',
  '/rates-and-fees',
  '/savings',
  '/security',
  '/security/fraud',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : DEFAULT_PRIORITY,
  }));
}
