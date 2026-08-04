import { Clock, FileCheck2, Home, TrendingDown } from 'lucide-react';

import { CtaBand } from '@/components/marketing/cta-band';
import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { formatBps } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Mortgages',
  description:
    'Residential and buy-to-let mortgages with a decision in principle in minutes, rates by ' +
    'loan-to-value band, and no fee for overpaying up to 10% a year.',
  path: '/borrow/mortgages',
});

const COLUMNS = [
  { key: 'product', label: 'Product' },
  { key: 'ltv', label: 'Maximum loan to value', numeric: true },
  { key: 'rate', label: 'Initial rate', numeric: true },
  { key: 'fee', label: 'Product fee', numeric: true },
] as const;

/**
 * The mortgage board.
 *
 * Held here rather than fetched: mortgage products are not in the public catalogue API,
 * which covers deposit and unsecured lending only. See `docs/HANDOFFS.md`.
 */
const MORTGAGE_PRODUCTS = [
  { name: 'Two-year fixed', ltv: '60%', rateBps: 419, fee: '£999' },
  { name: 'Two-year fixed', ltv: '85%', rateBps: 469, fee: '£999' },
  { name: 'Five-year fixed', ltv: '60%', rateBps: 405, fee: '£999' },
  { name: 'Five-year fixed', ltv: '85%', rateBps: 449, fee: '£999' },
  { name: 'Five-year fixed, fee free', ltv: '90%', rateBps: 512, fee: 'None' },
  { name: 'Buy-to-let, five-year fixed', ltv: '75%', rateBps: 534, fee: '£1,499' },
] as const;

const PROMISES = [
  {
    icon: Clock,
    title: 'A decision in principle in minutes',
    description:
      'A soft search, valid for ninety days, with a figure an estate agent will accept. No mark ' +
      'on your credit file.',
  },
  {
    icon: TrendingDown,
    title: 'Overpay up to 10% a year, free',
    description:
      'Every overpayment reduces the interest immediately rather than sitting in a reserve until ' +
      'the anniversary.',
  },
  {
    icon: Home,
    title: 'Take your rate with you',
    description:
      'Every mortgage is portable. Move house within the fixed period and the rate moves with you, ' +
      'subject to the new property meeting our criteria.',
  },
  {
    icon: FileCheck2,
    title: 'A named person from offer to completion',
    description:
      'One case handler, contactable directly, who has read your file. Not a queue and a reference ' +
      'number.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'How much can I borrow?',
    answer:
      'Usually up to four and a half times household income, subject to an affordability ' +
      'assessment that stress-tests the payment against a higher rate.',
  },
  {
    question: 'What deposit do I need?',
    answer:
      'From 10% for a residential purchase and 25% for buy-to-let. A larger deposit moves you into ' +
      'a lower loan-to-value band and a materially better rate.',
  },
  {
    question: 'What happens at the end of the fixed period?',
    answer:
      'You move onto our standard variable rate unless you switch. We write to you three months ' +
      'beforehand with the products available, and switching costs nothing.',
  },
  {
    question: 'Do you lend to the self-employed?',
    answer:
      'Yes, with two years of accounts or SA302s. One year may be acceptable where the trading ' +
      'history and the profession support it.',
  },
];

/** The mortgage page. */
export default function MortgagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Borrow"
        title="Mortgages"
        description="Residential and buy-to-let, priced by loan-to-value band, with a decision in principle that takes minutes and leaves no mark on your credit file."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section labelledBy="mortgage-rates-heading">
        <SectionHeading
          id="mortgage-rates-heading"
          eyebrow="Rates"
          title="The current board"
          description="Rates are held for thirty days from the date of a full application."
        />
        <div className="mt-8">
          <DataTable
            caption="Mortgage products by loan-to-value band, showing the initial rate and the product fee"
            columns={COLUMNS}
            footnote="Your home may be repossessed if you do not keep up repayments on your mortgage. Buy-to-let mortgages are not regulated by the Financial Conduct Authority."
          >
            {MORTGAGE_PRODUCTS.map((product) => (
              <DataRow key={`${product.name}-${product.ltv}`}>
                <RowHeader>{product.name}</RowHeader>
                <DataCell numeric>{product.ltv}</DataCell>
                <DataCell numeric>
                  <span className="text-fg font-medium">{formatBps(product.rateBps)}</span>
                </DataCell>
                <DataCell numeric>{product.fee}</DataCell>
              </DataRow>
            ))}
          </DataTable>
        </div>
      </Section>

      <Section tone="surface" labelledBy="mortgage-promises-heading">
        <SectionHeading
          id="mortgage-promises-heading"
          eyebrow="How we lend"
          title="Four things we do not charge extra for"
        />
        <FeatureGrid features={PROMISES} columns="four" className="mt-12" />
      </Section>

      <Section labelledBy="mortgage-steps-heading">
        <SectionHeading
          id="mortgage-steps-heading"
          eyebrow="The process"
          title="From first look to keys"
        />
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {[
            {
              title: 'Decision in principle',
              text: 'Minutes, online, soft search only. Valid for ninety days.',
            },
            {
              title: 'Full application',
              text: 'Identification, income and the property. Usually one sitting.',
            },
            {
              title: 'Valuation and offer',
              text: 'We instruct the valuation and issue the offer, typically inside two weeks.',
            },
            { title: 'Completion', text: 'Your solicitor draws the funds on the day you agreed.' },
          ].map((step, index) => (
            <li key={step.title} className="border-border bg-surface rounded-xl border p-6">
              <span className="font-display text-accent text-3xl font-semibold">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-fg mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="text-fg-muted mt-2 text-sm leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="surface" labelledBy="mortgage-faq-heading">
        <SectionHeading id="mortgage-faq-heading" title="Questions about mortgages" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Get a decision in principle"
        description="A soft search, a figure you can take to an estate agent, and no mark on your credit file."
        primary={{ href: '/contact', label: 'Speak to a mortgage adviser' }}
        secondary={{ href: '/insights/saving-for-a-house-deposit', label: 'Read about deposits' }}
      />
    </>
  );
}
