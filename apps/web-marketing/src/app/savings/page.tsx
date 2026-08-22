import { CalendarClock, Landmark, PiggyBank, Target } from 'lucide-react';

import { SavingsCalculator } from '@/components/calculators/savings-calculator';
import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { RateQuote } from '@/components/marketing/rate-quote';
import { Section, SectionHeading } from '@/components/marketing/section';
import { SavingsRateTable } from '@/components/rates/savings-rate-table';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { BANK, DEPOSIT_PROTECTION } from '@/content/site';
import { getCmsPage, getRates } from '@/lib/api/public-data';
import { highestRateBps } from '@/lib/rates';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

const FALLBACK_TITLE = 'Savings';
const FALLBACK_DESCRIPTION =
  'Easy-access savings with interest paid monthly, withdrawals the same day, and every rate ' +
  'published on one page.';

export async function generateMetadata() {
  const page = await getCmsPage('savings');

  return pageMetadata({
    title: page?.seo.title ?? 'Savings accounts with monthly interest',
    description:
      page?.seo.description ??
      'Open a savings account with monthly interest, same-day withdrawals and FSCS protection up to £85,000.',
    path: '/savings',
    keywords: [
      'savings account',
      'easy access savings',
      'monthly interest savings',
      'FSCS protected savings',
    ],
  });
}

const BENEFITS = [
  {
    icon: PiggyBank,
    title: 'Interest paid every month',
    description:
      'Not annually, not on an anniversary you have to remember. It lands on the same date each ' +
      'month and starts earning immediately.',
  },
  {
    icon: CalendarClock,
    title: 'Withdraw the same day',
    description:
      'No notice period, no penalty, no limit on the number of withdrawals. Money moves back to ' +
      'your current account in seconds.',
  },
  {
    icon: Target,
    title: 'Split it into goals',
    description:
      'Create as many pots as you like inside one account. Each has its own name, target and ' +
      'progress, and all of them earn the same rate.',
  },
  {
    icon: Landmark,
    title: 'Protected up to £85,000',
    description:
      'Eligible deposits are covered by the Financial Services Compensation Scheme, per person, ' +
      'across everything you hold with us.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'Is the rate fixed?',
    answer:
      'The easy-access rate is variable. If it changes we tell you at least fourteen days before ' +
      'a reduction takes effect, and immediately when it goes up.',
  },
  {
    question: 'When does interest start earning?',
    answer:
      'The day the money arrives. There is no delay and no minimum period before a deposit starts ' +
      'to count.',
  },
  {
    question: 'What is the maximum I can hold?',
    answer:
      'There is no cap on the account. Deposit protection covers £85,000 per person, so amounts ' +
      'above that are worth spreading across institutions.',
  },
  {
    question: 'Can I set up automatic saving?',
    answer:
      'Yes. Set a standing order for a fixed amount, turn on round-ups so card payments are ' +
      'rounded to the nearest pound, or both.',
  },
];

/** The savings page, including the growth projection. */
export default async function SavingsPage() {
  const rates = await getRates();
  const headlineRate = highestRateBps(rates.savings.map((entry) => entry.annualRateBps));
  const breadcrumbTrail = [
    { name: 'Home', path: '/' },
    { name: 'Savings', path: '/savings' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Save"
        title={FALLBACK_TITLE}
        description={FALLBACK_DESCRIPTION}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <RateQuote
          basisPoints={headlineRate}
          unit="AER"
          basis="variable, on the Easy Access Saver"
          effectiveFrom={rates.effectiveFrom}
          variant="display"
        />
      </PageHeader>

      <Section labelledBy="savings-rates-heading">
        <SectionHeading
          id="savings-rates-heading"
          eyebrow="Rates"
          title="What we pay, on everything"
          description="One table. No introductory rate that quietly drops after twelve months."
        />
        <div className="mt-8">
          <SavingsRateTable rates={rates} />
        </div>
      </Section>

      {/* No published rate means nothing to project at. The calculator quotes the rate in
          its own intro and compounds against it, so rendering it without one would put a
          made-up growth figure in front of a saver. */}
      {headlineRate === null ? null : (
        <Section id="calculator" tone="surface" labelledBy="savings-calculator-heading">
          <SectionHeading
            id="savings-calculator-heading"
            eyebrow="Calculator"
            title="See what regular saving adds up to"
            description="Compounded monthly at today’s rate, using the same arithmetic the account itself runs on."
          />
          <div className="mt-8">
            <SavingsCalculator annualRateBps={headlineRate} />
          </div>
        </Section>
      )}

      <Section labelledBy="savings-benefits-heading">
        <SectionHeading
          id="savings-benefits-heading"
          eyebrow="How it works"
          title="Four things that make it worth keeping"
        />
        <FeatureGrid features={BENEFITS} columns="four" className="mt-12" />
      </Section>

      <Section id="protection" tone="surface" labelledBy="protection-heading">
        <SectionHeading
          id="protection-heading"
          eyebrow="Protection"
          title="How your money is protected"
          description={`Eligible deposits held with ${BANK.shortName} are protected up to ${DEPOSIT_PROTECTION.limitLabel} per person by the ${DEPOSIT_PROTECTION.scheme}.`}
        />
        <div className="mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="border-border bg-surface rounded-xl border p-6">
            <h3 className="font-display text-fg text-lg font-semibold">What is covered</h3>
            <ul className="text-fg-muted mt-3 space-y-2">
              <li>Current accounts, savings accounts and term deposits.</li>
              <li>Balances in every currency, converted at the rate on the day of a claim.</li>
              <li>Joint accounts, up to the limit for each holder.</li>
            </ul>
          </div>
          <div className="border-border bg-surface rounded-xl border p-6">
            <h3 className="font-display text-fg text-lg font-semibold">What is not</h3>
            <ul className="text-fg-muted mt-3 space-y-2">
              <li>Anything above {DEPOSIT_PROTECTION.limitLabel} per person, per institution.</li>
              <li>Money held with another firm under a licence we share.</li>
              <li>Investments, which carry their own separate protections and risks.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section labelledBy="savings-faq-heading">
        <SectionHeading id="savings-faq-heading" title="Questions about saving" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Start earning on what you have already saved"
        description="Open a saver alongside your current account and move money between them instantly."
        primary={{ href: '/open-an-account', label: 'Open a savings account' }}
        secondary={{ href: '/rates-and-fees', label: 'Compare all our rates' }}
      />

      <JsonLdScript data={breadcrumbJsonLd(breadcrumbTrail)} />
      <JsonLdScript data={faqJsonLd(QUESTIONS)} />
    </>
  );
}
