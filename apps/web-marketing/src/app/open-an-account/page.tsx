import { Clock3, FileCheck, IdCard, ShieldCheck } from 'lucide-react';

import { Alert } from '@reliance/ui';

import { AccountPicker } from '@/components/marketing/account-picker';
import { FaqList } from '@/components/marketing/faq-list';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { APP_URL, DEPOSIT_PROTECTION } from '@/content/site';
import { getProducts } from '@/lib/api/public-data';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

const ICON_SIZE = 20;

export const metadata = pageMetadata({
  title: 'Open a current account or savings account online',
  description:
    'Choose an account, tell us who you are and confirm your identity in about five minutes. Most applications are decided the same day.',
  path: '/open-an-account',
  keywords: [
    'open a bank account',
    'open current account',
    'open savings account',
    'open bank account online',
  ],
});

const STEPS = [
  {
    icon: IdCard,
    title: 'Tell us who you are',
    text: 'Name, date of birth, address and nationality. Two minutes if you have it to hand.',
  },
  {
    icon: FileCheck,
    title: 'Confirm your identity',
    text: 'Photograph your passport or driving licence, then take a short video selfie so we can match it.',
  },
  {
    icon: Clock3,
    title: 'Wait a few minutes',
    text: 'Most decisions are automatic. If we need anything more we tell you exactly what, in the app.',
  },
  {
    icon: ShieldCheck,
    title: 'Set up your security',
    text: 'Register a passkey, set your card limits, and add money. Your virtual card works immediately.',
  },
] as const;

const REQUIREMENTS = [
  'You are 18 or over and resident in the United Kingdom.',
  'A valid passport, UK driving licence or national identity card.',
  'A phone that can take a photograph and a short video.',
  'Your National Insurance number, or your tax reference if you are taxed elsewhere.',
];

const QUESTIONS = [
  {
    question: 'How long does the whole thing take?',
    answer:
      'About five minutes to complete, and most applications are decided within a few minutes of ' +
      'that. Where we need to look at something by hand it is usually the same working day.',
  },
  {
    question: 'Does applying affect my credit score?',
    answer:
      'Opening a current account or savings account is a soft search that leaves no mark. ' +
      'Applying for an overdraft or a loan involves a full search, and we tell you before it runs.',
  },
  {
    question: 'What if my application is declined?',
    answer:
      'We tell you as much as we are permitted to. Sometimes the law prevents us from giving a ' +
      'reason. You can reapply after six months, or talk to us in a branch.',
  },
  {
    question: 'Can I open an account for a business?',
    answer:
      'Yes. Choose Business Pro and we will ask about the company, its directors and anyone ' +
      'holding more than 25%. Most are opened within one working day.',
  },
];

/**
 * The account-opening funnel.
 *
 * The marketing site takes the customer as far as choosing a product and knowing what they
 * will be asked for, and hands off to the authenticated application at that point. Nothing
 * personal is ever collected on this domain.
 */
export default async function OpenAnAccountPage() {
  const products = await getProducts();
  const breadcrumbTrail = [{ name: 'Home', path: '/' }, { name: 'Open an account', path: '/open-an-account' }];

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Open an account"
        description="Four steps, about five minutes, and most decisions are made the same day. Here is exactly what you will be asked for before you start."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section labelledBy="picker-heading">
        <h2 id="picker-heading" className="sr-only">
          Choose an account
        </h2>
        <AccountPicker products={products} applyBaseUrl={`${APP_URL}/apply`} />
      </Section>

      <Section tone="surface" labelledBy="steps-heading">
        <SectionHeading id="steps-heading" eyebrow="The process" title="What happens next" />
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="border-border bg-canvas rounded-xl border p-6">
                <span className="bg-accent-soft text-accent grid size-10 place-items-center rounded-lg">
                  <Icon size={ICON_SIZE} aria-hidden />
                </span>
                <h3 className="font-display text-fg mt-4 text-lg font-semibold">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-fg-muted mt-2 text-sm leading-relaxed">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section labelledBy="requirements-heading">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              id="requirements-heading"
              eyebrow="Before you start"
              title="What you will need"
              level="subsection"
            />
            <ul className="mt-6 space-y-3">
              {REQUIREMENTS.map((requirement) => (
                <li
                  key={requirement}
                  className="border-border bg-surface text-fg-muted rounded-lg border px-5 py-3.5"
                >
                  {requirement}
                </li>
              ))}
            </ul>

            <Alert
              tone="info"
              title="Your money is protected from the first deposit"
              className="mt-6"
            >
              Eligible deposits are protected up to {DEPOSIT_PROTECTION.limitLabel} per person by
              the {DEPOSIT_PROTECTION.scheme}, from the moment the account opens.
            </Alert>
          </div>

          <div>
            <SectionHeading
              id="apply-faq-heading"
              title="Questions before applying"
              level="subsection"
            />
            <div className="mt-6">
              <FaqList entries={QUESTIONS} />
            </div>
          </div>
        </div>
      </Section>

      <JsonLdScript data={breadcrumbJsonLd(breadcrumbTrail)} />
      <JsonLdScript data={faqJsonLd(QUESTIONS)} />
    </>
  );
}
