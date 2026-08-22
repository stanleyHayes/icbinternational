import { BadgeCheck, CalendarCheck, Coins, Search } from 'lucide-react';

import { LoanCalculator } from '@/components/calculators/loan-calculator';
import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { RateQuote } from '@/components/marketing/rate-quote';
import { Section, SectionHeading } from '@/components/marketing/section';
import { LendingRateTable } from '@/components/rates/lending-rate-table';
import { SCENES } from '@/content/photography';
import { getCmsPage, getRates } from '@/lib/api/public-data';
import { lowestRateBps } from '@/lib/rates';
import { pageMetadata } from '@/lib/seo/metadata';

const FALLBACK_TITLE = 'Personal loans';
const FALLBACK_DESCRIPTION =
  'Borrow between £1,000 and £25,000 at a rate fixed for the whole term, with the total amount ' +
  'repayable shown before you apply.';

export async function generateMetadata() {
  const page = await getCmsPage('loans');

  return pageMetadata({
    title: page?.seo.title ?? FALLBACK_TITLE,
    description: page?.seo.description ?? FALLBACK_DESCRIPTION,
    path: '/borrow/loans',
  });
}

const PROMISES = [
  {
    icon: Search,
    title: 'Check your rate without a mark on your file',
    description:
      'The eligibility check is a soft search. It shows the rate you would actually be offered and ' +
      'leaves nothing behind for another lender to see.',
  },
  {
    icon: Coins,
    title: 'Fixed for the whole term',
    description:
      'The rate you accept is the rate you pay in the final month. It does not track anything and ' +
      'it does not reset.',
  },
  {
    icon: CalendarCheck,
    title: 'Overpay whenever you like',
    description:
      'Pay off part or all of the balance early and we recalculate the interest. The early ' +
      'settlement charge is capped and shown in your agreement.',
  },
  {
    icon: BadgeCheck,
    title: 'Money the same day, usually',
    description:
      'Accepted applications are typically funded within hours, and always within one working day ' +
      'of the agreement being signed.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'What can I borrow for?',
    answer:
      'Most purposes: a car, home improvements, consolidating other borrowing, a large one-off ' +
      'cost. We cannot lend for gambling, investment, or business purposes on a personal loan.',
  },
  {
    question: 'Will I get the representative APR?',
    answer:
      'At least 51% of accepted applicants do. Your own rate depends on your circumstances, and we ' +
      'show it — with the total repayable — before you commit to anything.',
  },
  {
    question: 'What if I miss a payment?',
    answer:
      'Contact us before the due date if you can. We will not add a charge for a first missed ' +
      'payment, and there are options — a payment holiday, a longer term — that we can discuss.',
  },
  {
    question: 'Can I take a loan without a current account here?',
    answer:
      'You need a Reliance Bank current account for the repayments to be collected from. Opening ' +
      'one is part of the application if you do not already have it.',
  },
];

/** The personal loan page, including the repayment calculator. */
export default async function LoansPage() {
  const rates = await getRates();
  const products = rates.lending.map((entry) => ({
    code: entry.productCode,
    name: entry.productName,
  }));
  const headlineApr = lowestRateBps(rates.lending.map((entry) => entry.representativeAprBps));

  return (
    <>
      <PageHeader
        eyebrow="Borrow"
        title={FALLBACK_TITLE}
        description={FALLBACK_DESCRIPTION}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
        image={SCENES.loans}
      >
        <RateQuote
          basisPoints={headlineApr}
          unit="APR"
          basis="representative, fixed"
          effectiveFrom={rates.effectiveFrom}
          variant="display"
        />
      </PageHeader>

      <Section id="calculator" labelledBy="loan-calculator-heading">
        <SectionHeading
          id="loan-calculator-heading"
          eyebrow="Calculator"
          title="Work out the real cost first"
          description="Quoted by the same engine that builds the repayment schedule, so the monthly payment here is the payment the loan carries."
        />
        <div className="mt-8">
          <LoanCalculator products={products} />
        </div>
      </Section>

      <Section tone="surface" labelledBy="loan-rates-heading">
        <SectionHeading
          id="loan-rates-heading"
          eyebrow="Rates"
          title="What we lend, and at what price"
        />
        <div className="mt-8">
          <LendingRateTable rates={rates} />
        </div>
      </Section>

      <Section labelledBy="loan-promises-heading">
        <SectionHeading
          id="loan-promises-heading"
          eyebrow="How we lend"
          title="Four commitments, written into the agreement"
        />
        <FeatureGrid features={PROMISES} columns="four" className="mt-12" />
      </Section>

      <Section tone="surface" labelledBy="loan-faq-heading">
        <SectionHeading id="loan-faq-heading" title="Questions about borrowing" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Check your rate in two minutes"
        description="A soft search that shows your actual rate and leaves no mark on your credit file."
        primary={{ href: '/open-an-account', label: 'Check my rate' }}
        secondary={{ href: '/borrow/overdrafts', label: 'Consider an overdraft instead' }}
      />
    </>
  );
}
