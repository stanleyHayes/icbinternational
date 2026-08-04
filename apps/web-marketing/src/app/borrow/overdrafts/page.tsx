import { notFound } from 'next/navigation';

import { CtaBand } from '@/components/marketing/cta-band';
import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { FaqList } from '@/components/marketing/faq-list';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getProduct } from '@/lib/api/public-data';
import { formatBps } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';

const PRODUCT_CODE = 'RB-CURRENT-PLUS';

export const metadata = pageMetadata({
  title: 'Overdrafts',
  description:
    'One arranged overdraft rate, charged daily and capped each month, with a buffer before ' +
    'anything is charged at all.',
  path: '/borrow/overdrafts',
});

/** What £500 of overdraft costs over different periods, in pounds. */
const COST_EXAMPLES = [
  { days: '7 days', cost: '£3.83' },
  { days: '30 days', cost: '£16.41' },
  { days: '90 days', cost: '£49.24' },
] as const;

const QUESTIONS = [
  {
    question: 'Is there a buffer before I am charged?',
    answer:
      'Yes. The first £50 of any arranged overdraft is free, permanently. Below that balance ' +
      'nothing is charged at all.',
  },
  {
    question: 'What happens if I go over my arranged limit?',
    answer:
      'We try to contact you first. An unarranged overdraft is charged at the same rate as an ' +
      'arranged one — we do not price the two differently — and there is no separate fee.',
  },
  {
    question: 'Will applying affect my credit file?',
    answer:
      'Checking your eligibility is a soft search that leaves no mark. Accepting an arranged ' +
      'overdraft is recorded, as any credit facility is.',
  },
  {
    question: 'Can I reduce or remove the overdraft?',
    answer:
      'At any time, in the app, with no charge. Reducing the limit takes effect immediately as ' +
      'long as the balance is inside the new limit.',
  },
];

/** The overdraft page. */
export default async function OverdraftsPage() {
  const product = await getProduct(PRODUCT_CODE);
  if (!product) notFound();

  const rate = formatBps(product.debitInterestBps ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Borrow"
        title="Overdrafts"
        description="One rate, charged by the day, capped every month, with the first £50 free. No separate fee for arranging it and none for going over."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <dl className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <dt className="text-fg-muted text-sm">Arranged and unarranged</dt>
            <dd className="font-display text-fg mt-1 text-3xl font-semibold">
              {rate}
              <span className="text-fg-muted ml-2 text-sm font-normal">EAR variable</span>
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-sm">Interest-free buffer</dt>
            <dd className="font-display text-fg mt-1 text-3xl font-semibold">£50</dd>
          </div>
          <div>
            <dt className="text-fg-muted text-sm">Monthly cap</dt>
            <dd className="font-display text-fg mt-1 text-3xl font-semibold">£20</dd>
          </div>
        </dl>
      </PageHeader>

      <Section labelledBy="overdraft-cost-heading">
        <SectionHeading
          id="overdraft-cost-heading"
          eyebrow="What it costs"
          title="£500 overdrawn, in pounds"
          description="Interest is calculated daily on the amount above the £50 buffer and charged once a month."
        />
        <div className="mt-8 max-w-2xl">
          <DataTable
            caption="Cost of being £500 overdrawn for different lengths of time"
            columns={[
              { key: 'period', label: 'Overdrawn for' },
              { key: 'cost', label: 'Total interest', numeric: true },
            ]}
            footnote={`Based on the current ${rate} EAR and the £50 interest-free buffer. Charges are capped at £20 in any calendar month, however large the balance.`}
          >
            {COST_EXAMPLES.map((example) => (
              <DataRow key={example.days}>
                <RowHeader>{example.days}</RowHeader>
                <DataCell numeric>
                  <span className="text-fg font-medium">{example.cost}</span>
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        </div>
      </Section>

      <Section tone="surface" labelledBy="overdraft-rules-heading">
        <SectionHeading
          id="overdraft-rules-heading"
          eyebrow="How it works"
          title="The whole set of rules"
        />
        <ul className="mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
          {[
            'The first £50 is interest free, always, and is not a promotional period.',
            'Interest accrues daily and is charged on the first working day of the following month.',
            'Charges are capped at £20 in a calendar month, whatever the balance.',
            'Arranged and unarranged borrowing are priced identically. There is no penalty rate.',
            'We alert you before a payment would take you overdrawn, in time to move money.',
            'You can lower or remove the limit in the app at any time, at no cost.',
          ].map((rule) => (
            <li
              key={rule}
              className="border-border bg-surface text-fg-muted rounded-lg border px-5 py-4"
            >
              {rule}
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="overdraft-faq-heading">
        <SectionHeading id="overdraft-faq-heading" title="Questions about overdrafts" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Borrowing more than a few weeks?"
        description="A personal loan is almost always cheaper than a long-standing overdraft. The calculator shows both figures side by side."
        primary={{ href: '/borrow/loans', label: 'Compare with a loan' }}
        secondary={{ href: '/open-an-account', label: 'Open an account' }}
      />
    </>
  );
}
