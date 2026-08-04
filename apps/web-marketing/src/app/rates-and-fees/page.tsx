import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FeeTable } from '@/components/rates/fee-table';
import { FxBoardTable } from '@/components/rates/fx-board-table';
import { LendingRateTable } from '@/components/rates/lending-rate-table';
import { SavingsRateTable } from '@/components/rates/savings-rate-table';
import { getFees, getFxBoard, getRates } from '@/lib/api/public-data';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Rates and fees',
  description:
    'Every savings rate, lending rate, exchange rate and charge at Reliance Bank, published on ' +
    'one page and updated the day anything changes.',
  path: '/rates-and-fees',
});

const CONTENTS = [
  { href: '#savings', label: 'Savings rates' },
  { href: '#lending', label: 'Lending rates' },
  { href: '#charges', label: 'Charges' },
  { href: '#exchange', label: 'Exchange rates' },
] as const;

/**
 * The complete price list.
 *
 * One page, four tables, every figure read from the bank's own catalogue at build time. It
 * exists so that "what does this cost?" has exactly one answer and one URL, and so nothing
 * a customer can be charged lives only in a PDF.
 */
export default async function RatesAndFeesPage() {
  const [rates, fees, fxBoard] = await Promise.all([getRates(), getFees(), getFxBoard()]);

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Rates and fees"
        description="Everything we pay, everything we charge and every rate we convert at. If it is not on this page, it does not exist."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-2">
            {CONTENTS.map((entry) => (
              <li key={entry.href}>
                <a
                  href={entry.href}
                  className="rounded-pill border-border text-fg-muted hover:border-border-strong hover:text-fg inline-block border px-4 py-2 text-sm transition-colors"
                >
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-fg-subtle mt-6 text-sm">Last updated {formatDate(rates.asOf)}.</p>
      </PageHeader>

      <Section id="savings" labelledBy="savings-heading">
        <SectionHeading
          id="savings-heading"
          eyebrow="Savings"
          title="What we pay you"
          description="Interest is paid monthly and starts earning on the day the money arrives."
        />
        <div className="mt-8">
          <SavingsRateTable rates={rates} />
        </div>
      </Section>

      <Section id="lending" tone="surface" labelledBy="lending-heading">
        <SectionHeading
          id="lending-heading"
          eyebrow="Borrowing"
          title="What borrowing costs"
          description="Fixed for the whole term, with the total amount repayable quoted before you apply."
        />
        <div className="mt-8">
          <LendingRateTable rates={rates} />
        </div>
      </Section>

      <Section id="charges" labelledBy="charges-heading">
        <SectionHeading
          id="charges-heading"
          eyebrow="Charges"
          title="Every fee we can charge"
          description="Six lines. Most accounts never meet any of them."
        />
        <div className="mt-8">
          <FeeTable fees={fees} />
        </div>
      </Section>

      <Section id="exchange" tone="surface" labelledBy="exchange-heading">
        <SectionHeading
          id="exchange-heading"
          eyebrow="Foreign exchange"
          title="Today’s rates"
          description="Card payments abroad convert at the network rate with no mark-up. Held balances convert at the rate below."
        />
        <div className="mt-8">
          <FxBoardTable board={fxBoard} />
        </div>
      </Section>

      <CtaBand
        title="Nothing here changes without notice"
        description="A rate reduction gets fourteen days’ notice; a new charge gets sixty. Both arrive by email and in the app."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/legal/terms', label: 'Read the full terms' }}
      />
    </>
  );
}
