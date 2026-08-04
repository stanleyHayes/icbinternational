import Link from 'next/link';

import { Badge, cn, FOCUS_RING } from '@reliance/ui';

import type { InsightArticle } from '@/content/insights';
import { formatShortDate } from '@/lib/format';
import { insightHref } from '@/lib/routes';

function ArticleMeta({ article }: { readonly article: InsightArticle }) {
  return (
    <div className="flex items-center gap-3">
      <Badge tone="accent" size="sm">
        {article.category}
      </Badge>
      <span className="text-fg-subtle text-sm">{article.readingMinutes} minute read</span>
    </div>
  );
}

function ArticleByline({ article }: { readonly article: InsightArticle }) {
  return (
    <p className="text-fg-subtle mt-5 text-sm">
      {article.author.name}, {article.author.role} ·{' '}
      <time dateTime={article.publishedAt}>{formatShortDate(article.publishedAt)}</time>
    </p>
  );
}

/** One article in a list. The whole card is the link. */
export function ArticleCard({
  article,
  featured = false,
}: {
  readonly article: InsightArticle;
  readonly featured?: boolean;
}) {
  return (
    <li className={cn('h-full', featured && 'md:col-span-2')}>
      <Link
        href={insightHref(article.slug)}
        className={cn(
          'group border-border bg-surface flex h-full flex-col rounded-xl border p-6',
          'transition-all duration-(--rb-duration-base) hover:-translate-y-0.5 hover:shadow-md',
          FOCUS_RING,
        )}
      >
        <ArticleMeta article={article} />

        <h3
          className={cn(
            'font-display text-fg group-hover:text-accent mt-4 font-semibold',
            featured ? 'text-2xl md:text-3xl' : 'text-xl',
          )}
        >
          {article.title}
        </h3>

        <p className="text-fg-muted mt-3 grow leading-relaxed">{article.excerpt}</p>

        <ArticleByline article={article} />
      </Link>
    </li>
  );
}
