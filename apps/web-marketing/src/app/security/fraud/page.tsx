import { Alert } from '@reliance/ui';

import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { ProseBlocks } from '@/components/marketing/prose-blocks';
import { Section, SectionHeading } from '@/components/marketing/section';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { IF_IT_HAPPENED, SCAM_PATTERNS } from '@/content/fraud';
import { BANK } from '@/content/site';
import { faqJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Fraud awareness',
  description:
    'The six scams that cost customers the most, how each one starts, what the caller actually ' +
    'wants, and the single detail that gives every one of them away.',
  path: '/security/fraud',
});

/** The structured data mirrors the page exactly — same six patterns, same wording. */
function structuredData() {
  return faqJsonLd(
    SCAM_PATTERNS.map((pattern) => ({
      question: `What is the "${pattern.name}" scam?`,
      answer: `${pattern.howItStarts} ${pattern.whatTheyWant} ${pattern.tell}`,
    })),
  );
}

/** The fraud awareness page. */
export default function FraudAwarenessPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="How to spot a scam before it costs you"
        description="Almost every case we investigate is one of six patterns. They are described here exactly as customers meet them, including the detail that gives each one away."
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/security', label: 'Security' },
        ]}
      >
        <Alert tone="warning" title="One rule covers most of it">
          Nobody legitimate will ever ask you to move money to keep it safe, and nobody at{' '}
          {BANK.shortName} will ever ask for a passcode or a one-time code. If either happens, the
          call is not from us — whatever the caller ID says.
        </Alert>
      </PageHeader>

      <Section labelledBy="patterns-heading">
        <SectionHeading
          id="patterns-heading"
          eyebrow="The six"
          title="What each one looks like from the inside"
        />

        <ul className="mt-10 grid gap-6 lg:grid-cols-2">
          {SCAM_PATTERNS.map((pattern) => (
            <li key={pattern.name} className="border-border bg-surface rounded-xl border p-6">
              <h3 className="font-display text-fg text-xl font-semibold">{pattern.name}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-fg font-medium">How it starts</dt>
                  <dd className="text-fg-muted mt-1 leading-relaxed">{pattern.howItStarts}</dd>
                </div>
                <div>
                  <dt className="text-fg font-medium">What they actually want</dt>
                  <dd className="text-fg-muted mt-1 leading-relaxed">{pattern.whatTheyWant}</dd>
                </div>
                <div className="bg-accent-soft rounded-lg p-3">
                  <dt className="text-accent font-medium">The tell</dt>
                  <dd className="text-fg mt-1 leading-relaxed">{pattern.tell}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" labelledBy="if-it-happened-heading">
        <SectionHeading
          id="if-it-happened-heading"
          eyebrow="If it has already happened"
          title="What to do in the next hour"
        />
        <div className="mt-8">
          <ProseBlocks blocks={IF_IT_HAPPENED} />
        </div>
      </Section>

      <CtaBand
        title="Report something suspicious"
        description={`Call ${BANK.phoneDisplay}, or dial 159 from any phone to be connected to your bank. The line is open every hour of every day.`}
        primary={{ href: '/contact', label: 'Contact us' }}
        secondary={{ href: '/security', label: 'Back to the security centre' }}
      />

      <JsonLdScript data={structuredData()} />
    </>
  );
}
