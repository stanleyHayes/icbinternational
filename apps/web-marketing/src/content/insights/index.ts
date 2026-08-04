/**
 * The insights library.
 *
 * Sorted newest first at module load, once, rather than on every render of the index.
 */

import { MONEY_ARTICLES } from './money';
import { SAVING_ARTICLES } from './saving';
import { SECURITY_ARTICLES } from './security';
import type { InsightArticle, InsightCategory } from './types';

export { INSIGHT_CATEGORIES } from './types';
export type { InsightArticle, InsightCategory } from './types';

/** Every published article, newest first. */
export const INSIGHT_ARTICLES: readonly InsightArticle[] = [
  ...SAVING_ARTICLES,
  ...SECURITY_ARTICLES,
  ...MONEY_ARTICLES,
].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

/** One article by slug, or `undefined` when nothing is published under it. */
export function findArticle(slug: string): InsightArticle | undefined {
  return INSIGHT_ARTICLES.find((article) => article.slug === slug);
}

/** The categories that actually have something in them, in publication order. */
export function usedCategories(): readonly InsightCategory[] {
  const seen = new Set<InsightCategory>();
  for (const article of INSIGHT_ARTICLES) seen.add(article.category);
  return [...seen];
}

const RELATED_LIMIT = 3;

/**
 * Further reading for an article: same category first, then the newest of anything else.
 * Always returns something — an article page that ends in a dead end wastes the visit.
 */
export function relatedArticles(current: InsightArticle): readonly InsightArticle[] {
  const others = INSIGHT_ARTICLES.filter((article) => article.slug !== current.slug);
  const sameCategory = others.filter((article) => article.category === current.category);
  const rest = others.filter((article) => article.category !== current.category);

  return [...sameCategory, ...rest].slice(0, RELATED_LIMIT);
}
