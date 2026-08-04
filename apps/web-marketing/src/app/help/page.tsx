import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { cn, FOCUS_RING } from '@reliance/ui';

import { FaqSearch } from '@/components/help/faq-search';
import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { HELP_TOPICS } from '@/content/help-topics';
import { BANK } from '@/content/site';
import { getFaqs } from '@/lib/api/public-data';
import { faqJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

const ICON_SIZE = 16;

export const metadata = pageMetadata({
  title: 'Help centre',
  description:
    'Search the answers to the questions we are asked most, or find the fastest way to reach a ' +
    'person who can help.',
  path: '/help',
});

/**
 * The help centre.
 *
 * The FAQ list is rendered from the published answers, and the FAQ structured data is built
 * from the same array — so the graph a search engine reads can never list a question the
 * page does not show.
 */
export default async function HelpCentrePage() {
  const faqs = await getFaqs();

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="How can we help?"
        description={`Search our answers, or skip straight to a person. Whatever you need, ${BANK.phoneDisplay} reaches a human being seven days a week.`}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section labelledBy="faq-heading">
        <SectionHeading id="faq-heading" eyebrow="Answers" title="Search the help centre" />
        <div className="mt-8">
          <FaqSearch faqs={faqs} />
        </div>
      </Section>

      <Section tone="surface" labelledBy="topics-heading">
        <SectionHeading
          id="topics-heading"
          eyebrow="Browse"
          title="Or start from a topic"
          description="Six areas that cover most of what people write in about."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.href}>
              <Link
                href={topic.href}
                className={cn(
                  'group border-border bg-canvas flex h-full flex-col rounded-xl border p-5',
                  'transition-all duration-(--rb-duration-base) hover:-translate-y-0.5 hover:shadow-sm',
                  FOCUS_RING,
                )}
              >
                <h3 className="font-display text-fg text-lg font-semibold">{topic.title}</h3>
                <p className="text-fg-muted mt-2 grow text-sm leading-relaxed">
                  {topic.description}
                </p>
                <span className="text-accent mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                  Read more
                  <ArrowRight
                    size={ICON_SIZE}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Still stuck?"
        description="Send us the detail and a person will read it. We answer messages within one working day."
        primary={{ href: '/contact', label: 'Contact us' }}
        secondary={{ href: '/branches', label: 'Find a branch' }}
      />

      <JsonLdScript
        data={faqJsonLd(faqs.map((faq) => ({ question: faq.question, answer: faq.answer })))}
      />
    </>
  );
}
