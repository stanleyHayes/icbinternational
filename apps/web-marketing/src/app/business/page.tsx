import { FileText, Layers, ScrollText, ShieldCheck, Users, Wallet } from 'lucide-react';

import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { LimitsTable } from '@/components/rates/limits-table';
import { getCmsPage, getProduct } from '@/lib/api/public-data';
import { pageMetadata } from '@/lib/seo/metadata';

const PRODUCT_CODE = 'RB-BUSINESS-PRO';

const FALLBACK_TITLE = 'Business banking';
const FALLBACK_DESCRIPTION =
  'An account built for more than one person: multi-user access, two-signature approvals, ' +
  'payroll for the whole team and invoicing that settles into the right account.';

export async function generateMetadata() {
  const page = await getCmsPage('business');

  return pageMetadata({
    title: page?.seo.title ?? FALLBACK_TITLE,
    description: page?.seo.description ?? FALLBACK_DESCRIPTION,
    path: '/business',
  });
}

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Everyone gets their own login',
    description:
      'Owner, admin, approver, bookkeeper and viewer. Nobody shares a password, and every action ' +
      'is attributed to the person who took it.',
  },
  {
    icon: ShieldCheck,
    title: 'Two signatures on anything that matters',
    description:
      'Set a threshold and payments above it need a second approval before they move. Below it, ' +
      'the team just gets on with the work.',
  },
  {
    icon: Layers,
    title: 'Bulk payments in one file',
    description:
      'Upload a batch of suppliers, review the total, approve once. Each line reports its own ' +
      'status rather than the batch failing as a block.',
  },
  {
    icon: Wallet,
    title: 'Hold twenty-five currencies',
    description:
      'Invoice in the currency your customer uses, hold the balance, and convert when the rate ' +
      'suits rather than the day the money lands.',
  },
  {
    icon: FileText,
    title: 'Export that your accountant accepts',
    description:
      'CSV and OFX, with the categories you set and a reference on every line. No copying figures ' +
      'out of a PDF.',
  },
  {
    icon: ScrollText,
    title: 'A full audit trail',
    description:
      'Every approval, every change to a limit, every new user, with who did it and when. It is ' +
      'exportable, and it is not editable.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'How long does it take to open a business account?',
    answer:
      'Most sole traders and limited companies are opened within one working day. We verify the ' +
      'company, its directors and anyone holding more than 25%.',
  },
  {
    question: 'Can I control what each person can do?',
    answer:
      'Yes. Each member gets a role and, optionally, an approval threshold. A bookkeeper can see ' +
      'and export everything without being able to move a penny.',
  },
  {
    question: 'Do you support payroll?',
    answer:
      'Yes. Upload the run, review the gross and net totals, and approve once. Each employee’s ' +
      'payment reports its own status, so one failure does not stop the rest.',
  },
  {
    question: 'What happens if a payment needs a second approver who is away?',
    answer:
      'Approval requests expire rather than sitting indefinitely, and you can nominate more than ' +
      'one approver so a holiday does not stop the business.',
  },
];

/** The business banking page. */
export default async function BusinessBankingPage() {
  const product = await getProduct(PRODUCT_CODE);

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title={FALLBACK_TITLE}
        description={FALLBACK_DESCRIPTION}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section id="accounts" labelledBy="business-capabilities-heading">
        <SectionHeading
          id="business-capabilities-heading"
          eyebrow="Business Pro"
          title="Built for a team, not a single signatory"
          description="Every business account includes all of this. There is no tier where approvals become an add-on."
        />
        <FeatureGrid features={CAPABILITIES} className="mt-12" />
      </Section>

      <Section id="approvals" tone="surface" labelledBy="approvals-heading">
        <SectionHeading
          id="approvals-heading"
          eyebrow="Approvals"
          title="How a payment actually gets made"
          description="Four steps, each attributed to a named person and each recorded permanently."
        />
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {[
            {
              step: 'Raised',
              text: 'Anyone with payment rights creates the payment and adds a reference.',
            },
            {
              step: 'Checked',
              text: 'We confirm the payee name against the receiving bank before it leaves.',
            },
            {
              step: 'Approved',
              text: 'Payments over your threshold wait for a second named approver.',
            },
            {
              step: 'Settled',
              text: 'The payment goes, and the audit trail records who did what, and when.',
            },
          ].map((entry, index) => (
            <li key={entry.step} className="border-border bg-surface rounded-xl border p-6">
              <span className="font-display text-accent text-3xl font-semibold">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-fg mt-3 text-lg font-semibold">{entry.step}</h3>
              <p className="text-fg-muted mt-2 text-sm leading-relaxed">{entry.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="payroll" labelledBy="payroll-heading">
        <SectionHeading
          id="payroll-heading"
          eyebrow="Payroll and invoicing"
          title="Paying people, and getting paid"
        />
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="border-border bg-surface rounded-xl border p-6">
            <h3 className="font-display text-fg text-lg font-semibold">Payroll</h3>
            <p className="text-fg-muted mt-2 leading-relaxed">
              Upload a run, check the gross, deductions and net for the whole team, and approve it
              once. Each employee’s payment carries its own status and its own failure reason, so a
              wrong sort code on one line does not hold up the other ten.
            </p>
          </div>
          <div id="invoicing" className="border-border bg-surface rounded-xl border p-6">
            <h3 className="font-display text-fg text-lg font-semibold">Invoicing</h3>
            <p className="text-fg-muted mt-2 leading-relaxed">
              Raise an invoice with line items, tax and a due date, send it with a payment link, and
              watch it reconcile itself against the settlement account when the money arrives. Part
              payments are tracked rather than rounded away.
            </p>
          </div>
        </div>
      </Section>

      {product ? (
        <Section tone="surface" labelledBy="business-limits-heading">
          <SectionHeading
            id="business-limits-heading"
            eyebrow="Limits"
            title="What the account can move"
            description="Higher limits are available once we have verified the business to the next tier."
          />
          <div className="mt-8">
            <LimitsTable product={product} />
          </div>
        </Section>
      ) : null}

      <Section labelledBy="business-faq-heading">
        <SectionHeading id="business-faq-heading" title="Questions from business owners" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Open a business account"
        description="Most limited companies and sole traders are opened within one working day."
        primary={{ href: '/open-an-account', label: 'Open a business account' }}
        secondary={{ href: '/contact', label: 'Talk to the business team' }}
      />
    </>
  );
}
