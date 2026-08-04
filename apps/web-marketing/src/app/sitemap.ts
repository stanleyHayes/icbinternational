import type { MetadataRoute } from 'next';

import { INSIGHT_ARTICLES } from '@/content/insights';
import { INDEXED_ROUTES } from '@/content/routes-index';
import { SITE_URL } from '@/content/site';

/** The date the static pages were last reviewed, in ISO form. */
const CONTENT_REVIEWED_ON = '2026-08-01';

const ARTICLE_PRIORITY = 0.6;

/**
 * The sitemap.
 *
 * Built from an explicit route list rather than the filesystem, so a page that should not
 * be indexed — a funnel step, a confirmation — cannot slip in by existing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = INDEXED_ROUTES.map((route) => ({
    url: new URL(route.path, SITE_URL).toString(),
    lastModified: CONTENT_REVIEWED_ON,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const articles = INSIGHT_ARTICLES.map((article) => ({
    url: new URL(`/insights/${article.slug}`, SITE_URL).toString(),
    lastModified: article.publishedAt,
    changeFrequency: 'yearly' as const,
    priority: ARTICLE_PRIORITY,
  }));

  return [...staticPages, ...articles];
}
