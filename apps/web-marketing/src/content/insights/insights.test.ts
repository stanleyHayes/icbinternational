// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under
// this workspace's pnpm layout, and `tsconfig.json` is shared configuration this app
// does not own. The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

import { INSIGHT_ARTICLES, findArticle, relatedArticles, usedCategories } from './index';

describe('the insights library', () => {
  it('publishes every article under a unique slug', () => {
    const slugs = INSIGHT_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses slugs a URL can carry unescaped', () => {
    for (const article of INSIGHT_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('orders newest first', () => {
    const dates = INSIGHT_ARTICLES.map((article) => article.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('gives every article a body, an excerpt and an author', () => {
    for (const article of INSIGHT_ARTICLES) {
      expect(article.body.length).toBeGreaterThan(0);
      expect(article.excerpt.length).toBeGreaterThan(0);
      expect(article.author.name.length).toBeGreaterThan(0);
      expect(article.readingMinutes).toBeGreaterThan(0);
    }
  });

  it('finds an article by slug and refuses one that is not published', () => {
    const first = INSIGHT_ARTICLES[0];
    expect(first).toBeDefined();
    expect(findArticle(first?.slug ?? '')).toBe(first);
    expect(findArticle('not-a-published-article')).toBeUndefined();
  });

  it('never leaves an article without further reading', () => {
    for (const article of INSIGHT_ARTICLES) {
      const related = relatedArticles(article);
      expect(related.length).toBeGreaterThan(0);
      expect(related).not.toContain(article);
    }
  });

  it('lists only categories that have something in them', () => {
    for (const category of usedCategories()) {
      expect(INSIGHT_ARTICLES.some((article) => article.category === category)).toBe(true);
    }
  });
});
