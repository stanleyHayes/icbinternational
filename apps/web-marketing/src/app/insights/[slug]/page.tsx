import { notFound } from 'next/navigation';

import { Badge } from '@reliance/ui';

import { ArticleCard } from '@/components/insights/article-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { ProseBlocks } from '@/components/marketing/prose-blocks';
import { Section, SectionHeading } from '@/components/marketing/section';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { findArticle, INSIGHT_ARTICLES, relatedArticles } from '@/content/insights';
import { formatDate } from '@/lib/format';
import { insightHref } from '@/lib/routes';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

interface ArticlePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

/** The library is fixed at build time, so every article is prerendered. */
export function generateStaticParams() {
  return INSIGHT_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = findArticle(slug);

  if (!article) {
    return pageMetadata({
      title: 'Money insights',
      description: 'Practical guides on saving, borrowing, fraud and everyday money.',
      path: '/insights',
      noIndex: true,
    });
  }

  return pageMetadata({
    title: article.title,
    description: article.excerpt,
    path: `/insights/${article.slug}`,
    article: {
      publishedTime: article.publishedAt,
      authors: [article.author.name],
      section: article.category,
      tags: article.tags,
    },
  });
}

/** One article. */
export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();

  const related = relatedArticles(article);

  return (
    <>
      <PageHeader
        eyebrow={article.category}
        title={article.title}
        description={article.excerpt}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/insights', label: 'Insights' },
        ]}
      >
        <p className="text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-fg font-medium">{article.author.name}</span>
          <span>{article.author.role}</span>
          <span aria-hidden>·</span>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
          <span aria-hidden>·</span>
          <span>{article.readingMinutes} minute read</span>
        </p>
      </PageHeader>

      <Section>
        <article>
          <ProseBlocks blocks={article.body} />

          <ul className="mt-12 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <li key={tag}>
                <Badge tone="neutral" size="sm">
                  {tag}
                </Badge>
              </li>
            ))}
          </ul>
        </article>
      </Section>

      <Section tone="surface" labelledBy="related-heading">
        <SectionHeading id="related-heading" title="Read next" level="subsection" />
        <ul className="mt-6 grid gap-6 md:grid-cols-3">
          {related.map((entry) => (
            <ArticleCard key={entry.slug} article={entry} />
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Banking that agrees with itself"
        description="Every figure on this site comes from the same catalogue the bank runs on. Open an account in about five minutes."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/insights', label: 'More insights' }}
      />

      <JsonLdScript
        data={articleJsonLd({
          headline: article.title,
          description: article.excerpt,
          path: insightHref(article.slug),
          publishedAt: article.publishedAt,
          authorName: article.author.name,
        })}
      />
      <JsonLdScript
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Insights', path: '/insights' },
          { name: article.title, path: insightHref(article.slug) },
        ])}
      />
    </>
  );
}
