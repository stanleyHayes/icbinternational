import { Banknote, CreditCard, PiggyBank, Repeat, Smartphone, Users } from 'lucide-react';

import { AppShowcase } from '@/components/marketing/app-showcase';
import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { ProductShowcase } from '@/components/marketing/product-showcase';
import { Section, SectionHeading } from '@/components/marketing/section';
import { TrustBand } from '@/components/marketing/trust-band';
import { SCENES } from '@/content/photography';
import { getCmsPage, getProducts } from '@/lib/api/public-data';
import { pageMetadata } from '@/lib/seo/metadata';

const FALLBACK_TITLE = 'Personal banking';
const FALLBACK_DESCRIPTION =
  'A current account with no monthly fee, savings that pay monthly, cards you control from ' +
  'your phone, and lending that shows the total cost before you apply.';

/** Search-facing copy is content-managed; the page falls back to its own if none is published. */
export async function generateMetadata() {
  const page = await getCmsPage('personal');

  return pageMetadata({
    title: page?.seo.title ?? FALLBACK_TITLE,
    description: page?.seo.description ?? FALLBACK_DESCRIPTION,
    path: '/personal',
  });
}

const CAPABILITIES = [
  {
    icon: Banknote,
    title: 'Your salary, a day early',
    description:
      'We credit your account as soon as your employer’s payment file reaches us — usually the ' +
      'working day before payday, at no cost.',
  },
  {
    icon: Repeat,
    title: 'Switching handled for you',
    description:
      'We move your balance, your direct debits and your standing orders, and redirect anything ' +
      'that arrives at the old account for three years.',
  },
  {
    icon: CreditCard,
    title: 'Cards you set the rules for',
    description:
      'Per-transaction limits, contactless on or off, online payments blocked by default if you ' +
      'prefer. Change any of it in seconds.',
  },
  {
    icon: PiggyBank,
    title: 'Round-ups into a goal',
    description:
      'Round every card payment up to the nearest pound and send the difference to whatever you ' +
      'are saving for.',
  },
  {
    icon: Smartphone,
    title: 'Notifications that mean something',
    description:
      'Every payment as it happens, with the merchant name and the balance left — not a daily ' +
      'digest of yesterday.',
  },
  {
    icon: Users,
    title: 'Joint accounts without the paperwork',
    description:
      'Open one online in a single sitting. Both of you get your own card, your own limits and ' +
      'your own view of the account.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'How long does it take to switch?',
    answer:
      'Seven working days from the moment you confirm. You choose the date, we do the rest, and ' +
      'anything that arrives at your old account is redirected for three years.',
  },
  {
    question: 'Do I need to pay in a minimum each month?',
    answer:
      'No. There is no minimum pay-in, no minimum balance and no monthly fee on the Current ' +
      'Account Plus, whatever you use it for.',
  },
  {
    question: 'Can I have more than one account?',
    answer:
      'Yes. Most customers hold a current account, an easy-access saver and often a ' +
      'multi-currency wallet. There is no charge for holding more than one.',
  },
  {
    question: 'What identification do I need to open one?',
    answer:
      'Photo identification — a passport or a driving licence — and a selfie so we can match it. ' +
      'Most applications are decided within a few minutes.',
  },
];

/** The personal banking hub. */
export default async function PersonalBankingPage() {
  const products = await getProducts();

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title={FALLBACK_TITLE}
        description={FALLBACK_DESCRIPTION}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
        image={SCENES.personal}
      />

      <ProductShowcase products={products} />
      <TrustBand />

      <Section tone="surface" labelledBy="capabilities-heading">
        <SectionHeading
          id="capabilities-heading"
          eyebrow="Day to day"
          title="What you get on the first day, not after six months"
          description="No introductory rates, no bundles to keep, no fee that appears in month four."
        />
        <FeatureGrid features={CAPABILITIES} className="mt-12" />
      </Section>

      <AppShowcase />

      <Section labelledBy="personal-faq-heading">
        <SectionHeading id="personal-faq-heading" title="Questions we are asked most" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Ready when you are"
        description="Opening an account takes about five minutes and most are decided the same day."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/personal/current-accounts', label: 'See the current account' }}
      />
    </>
  );
}
