import { notFound } from 'next/navigation';

import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FeeTable } from '@/components/rates/fee-table';
import { FxBoardTable } from '@/components/rates/fx-board-table';
import { LimitsTable } from '@/components/rates/limits-table';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { getFxBoard, getProduct } from '@/lib/api/public-data';
import { formatBps } from '@/lib/format';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';

const PRODUCT_CODE = 'RB-CURRENT-PLUS';
const WALLET_CODE = 'RB-MULTI-CURRENCY';

export const metadata = pageMetadata({
  title: 'Current accounts in the UK',
  description:
    'The Current Account Plus has no monthly fee, no minimum balance, salary a day early and all fees published clearly. Compare current accounts and discover the multi-currency wallet.',
  path: '/personal/current-accounts',
  keywords: [
    'current account',
    'free current account',
    'no monthly fee account',
    'multi-currency wallet',
  ],
});

const QUESTIONS = [
  {
    question: 'Is the account really free to run?',
    answer:
      'Yes. There is no monthly fee and no minimum balance. The charges that do exist — an ' +
      'international transfer, a returned payment — are listed on this page and nowhere else.',
  },
  {
    question: 'What happens if I go overdrawn without an arrangement?',
    answer:
      'We will try to contact you before anything is charged. An unarranged overdraft is priced ' +
      'per day, capped monthly, and never costs more than the arranged rate would have.',
  },
  {
    question: 'Can I use the account abroad?',
    answer:
      'Yes. Card payments abroad are charged at the network rate with no mark-up. The first three ' +
      'cash withdrawals abroad each month are free.',
  },
];

/** The current account product page. */
export default async function CurrentAccountsPage() {
  const [product, wallet, fxBoard] = await Promise.all([
    getProduct(PRODUCT_CODE),
    getProduct(WALLET_CODE),
    getFxBoard(),
  ]);

  if (!product) notFound();

  const breadcrumbTrail = [
    { name: 'Home', path: '/' },
    { name: 'Personal', path: '/personal' },
    { name: product.name, path: '/personal/current-accounts' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title={product.name}
        description={product.tagline}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/personal', label: 'Personal' },
        ]}
      >
        <dl className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <dt className="text-fg-muted text-sm">Monthly fee</dt>
            <dd className="font-display text-fg mt-1 text-2xl font-semibold">None</dd>
          </div>
          <div>
            <dt className="text-fg-muted text-sm">Minimum balance</dt>
            <dd className="font-display text-fg mt-1 text-2xl font-semibold">None</dd>
          </div>
          <div>
            <dt className="text-fg-muted text-sm">Arranged overdraft</dt>
            <dd className="font-display text-fg mt-1 text-2xl font-semibold">
              {formatBps(product.debitInterestBps ?? 0)}
              <span className="text-fg-muted ml-1 text-sm font-normal">EAR variable</span>
            </dd>
          </div>
        </dl>
      </PageHeader>

      <Section labelledBy="included-heading">
        <SectionHeading
          id="included-heading"
          eyebrow="Included"
          title="What comes with the account"
          description="Every one of these is on from the day the account opens."
        />
        <ul className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
          {product.features.map((feature) => (
            <li
              key={feature}
              className="border-border bg-surface text-fg rounded-lg border px-4 py-3"
            >
              {feature}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" labelledBy="limits-heading">
        <SectionHeading
          id="limits-heading"
          eyebrow="Limits"
          title="How much you can move, and how often"
          description="Published in full, because a limit you discover at the till is a limit that failed you."
        />
        <div className="mt-8">
          <LimitsTable product={product} />
        </div>
      </Section>

      <Section labelledBy="charges-heading">
        <SectionHeading
          id="charges-heading"
          eyebrow="Charges"
          title="Everything the account can cost you"
        />
        <div className="mt-8">
          <FeeTable fees={product.fees} />
        </div>
      </Section>

      {wallet ? (
        <Section id="multi-currency" tone="surface" labelledBy="wallet-heading">
          <SectionHeading
            id="wallet-heading"
            eyebrow="Multi-currency"
            title={wallet.name}
            description={`${wallet.tagline}. Hold a balance in each, spend from whichever one you are standing in, and convert at the rate on the board below.`}
          />
          <div className="mt-8">
            <FxBoardTable board={fxBoard} />
          </div>
        </Section>
      ) : null}

      <Section labelledBy="account-faq-heading">
        <SectionHeading id="account-faq-heading" title="Questions about the account" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Open a Current Account Plus"
        description="Five minutes, photo identification, and most applications are decided the same day."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/rates-and-fees', label: 'Compare every account' }}
      />

      <JsonLdScript data={breadcrumbJsonLd(breadcrumbTrail)} />
      <JsonLdScript data={faqJsonLd(QUESTIONS)} />
    </>
  );
}
