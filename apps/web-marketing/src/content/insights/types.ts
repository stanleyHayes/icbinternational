import type { Prose } from '@/content/prose';

/** The four sections the insights index is organised into. */
export const INSIGHT_CATEGORIES = ['Saving', 'Borrowing', 'Security', 'Everyday money'] as const;

/** One of the four sections. */
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

/**
 * A published article.
 *
 * Written and held here rather than fetched, because this is the bank's own editorial
 * voice: the money team writes it, the compliance team reads it, and it ships with the
 * site. Rates and product terms quoted inside an article always link out to the page that
 * holds the live figure, so an article can go stale without ever being wrong.
 */
export interface InsightArticle {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly category: InsightCategory;
  readonly author: { readonly name: string; readonly role: string };
  /** ISO date. Shown, and used for ordering and for the article's structured data. */
  readonly publishedAt: string;
  readonly readingMinutes: number;
  readonly tags: readonly string[];
  readonly body: Prose;
}
