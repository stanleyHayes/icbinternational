import { Banknote, Building2, Clock, Landmark, ShieldCheck, Smartphone } from 'lucide-react';

import { AppShowcase } from '@/components/marketing/app-showcase';
import { CtaBand } from '@/components/marketing/cta-band';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { HomeHero } from '@/components/marketing/home-hero';
import { ProductShowcase } from '@/components/marketing/product-showcase';
import { Section, SectionHeading } from '@/components/marketing/section';
import { Testimonials } from '@/components/marketing/testimonials';
import { TrustBand } from '@/components/marketing/trust-band';
import { getProducts, getRates } from '@/lib/api/public-data';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Current accounts, savings and business banking in the UK',
  description:
    'Open a current account, compare savings rates and apply for business banking or lending with no hidden fees. Deposits are protected up to £85,000.',
  path: '/',
  keywords: [
    'current account',
    'savings account',
    'business banking',
    'personal loan',
    'mortgage',
    'multi-currency wallet',
  ],
});

const PROMISES = [
  {
    icon: Banknote,
    title: 'No monthly fee, and no small print holding it up',
    description:
      'The current account costs nothing to run. There is no minimum balance, no salary ' +
      'requirement and no bundle you have to keep to hold the price.',
  },
  {
    icon: Clock,
    title: 'Payments that arrive when we say they will',
    description:
      'Most domestic transfers land within two hours, all within one working day, and the app ' +
      'tells you the moment they do.',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud cover that starts before the fraud',
    description:
      'Passkeys, per-card limits you set yourself, and a team that answers the lost-and-stolen ' +
      'line at three in the morning.',
  },
  {
    icon: Smartphone,
    title: 'An app that shows the whole picture',
    description:
      'Balances, budgets, cards and goals in one place, with spending categorised as it lands.',
  },
  {
    icon: Building2,
    title: 'Business banking that expects more than one person',
    description:
      'Multi-user access, two-signature approvals and payroll for the whole team, from day one.',
  },
  {
    icon: Landmark,
    title: 'A branch when it has to be a branch',
    description:
      'Sixty branches and a network of free ATMs, for the days when a conversation beats an app.',
  },
] as const;

/** The home page. Static: every figure on it is resolved at build time. */
export default async function HomePage() {
  const [rates, products] = await Promise.all([getRates(), getProducts()]);
  const headlineSavingsRate = Math.max(...rates.savings.map((entry) => entry.annualRateBps));

  return (
    <>
      <HomeHero savingsRateBps={headlineSavingsRate} />
      <TrustBand />
      <ProductShowcase products={products} />

      <Section tone="surface" labelledBy="promises-heading">
        <SectionHeading
          id="promises-heading"
          eyebrow="What we do differently"
          title="Six things we will not quietly change later"
          description="Everything here is written into the terms, not just the marketing."
        />
        <FeatureGrid features={PROMISES} className="mt-12" />
      </Section>

      <AppShowcase />
      <Testimonials />

      <CtaBand
        title="Open an account in about five minutes"
        description="You will need photo ID and a few details. Most applications are decided the same day."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/rates-and-fees', label: 'Compare rates and fees' }}
      />
    </>
  );
}
