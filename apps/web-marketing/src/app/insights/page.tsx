import { ArticleCard } from '@/components/insights/article-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { INSIGHT_ARTICLES, usedCategories } from '@/content/insights';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Money insights',
  description:
    'Practical guides on saving, borrowing, fraud and everyday money, written by the people who ' +
    'build and run the bank.',
  path: '/insights',
});

/** The insights index, grouped by section with the newest article featured. */
export default function InsightsIndexPage() {
  const [latest, ...rest] = INSIGHT_ARTICLES;
  const categories = usedCategories();

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Money insights"
        description="Written by the people who build and run the bank — the savings team, the lending team, and the people who spend their days investigating fraud."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section labelledBy="latest-heading">
        <SectionHeading id="latest-heading" title="Latest" />
        <ul className="mt-8 grid gap-6 md:grid-cols-2">
          {latest ? <ArticleCard article={latest} featured /> : null}
          {rest.slice(0, 2).map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </ul>
      </Section>

      {categories.map((category) => {
        const inCategory = INSIGHT_ARTICLES.filter((article) => article.category === category);
        const headingId = `category-${category.toLowerCase().replaceAll(' ', '-')}`;

        return (
          <Section key={category} tone="surface" spacing="tight" labelledBy={headingId}>
            <SectionHeading id={headingId} title={category} level="subsection" />
            <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {inCategory.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </ul>
          </Section>
        );
      })}

      <CtaBand
        title="One email a month, no more"
        description="A short note with the month’s guides and anything that has changed in our rates. Unsubscribe in one click."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/help', label: 'Visit the help centre' }}
      />
    </>
  );
}
