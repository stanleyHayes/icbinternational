import type { Product } from '@reliance/contracts';
import { AccountType } from '@reliance/contracts';

import { formatAer, formatBps } from '@/lib/format';
import type { SiteHref } from '@/lib/routes';

import { ProductCard } from './product-card';
import { Section, SectionHeading } from './section';

/** Where each catalogue entry lives on this site. */
const PRODUCT_PAGE: Readonly<Record<string, SiteHref>> = {
  'RB-CURRENT-PLUS': '/personal/current-accounts',
  'RB-SAVER-EASY': '/savings',
  'RB-BUSINESS-PRO': '/business',
  'RB-MULTI-CURRENCY': '/personal/current-accounts#multi-currency',
};

const FEATURED_CODE = 'RB-CURRENT-PLUS';
const FEATURE_LIMIT = 3;

/** The headline figure for a product is whatever decides it — a rate, or the monthly fee. */
function headlineFor(product: Product): { readonly value: string; readonly label: string } {
  const creditRate = product.creditInterestTiers[0]?.annualRateBps;
  if (creditRate !== undefined)
    return { value: formatAer(creditRate), label: 'Paid monthly, variable' };

  if (product.accountType === AccountType.FX_WALLET) {
    return { value: '25 currencies', label: 'Hold, send and spend' };
  }

  const monthlyFee = BigInt(product.monthlyFee.amount);
  return monthlyFee === 0n
    ? { value: 'No monthly fee', label: 'No minimum balance either' }
    : { value: formatBps(product.debitInterestBps ?? 0), label: 'Representative EAR, variable' };
}

/**
 * The product grid, built from the live catalogue.
 *
 * Rates and fees come from the products API rather than being written into the page, so a
 * repricing shows up here without anybody remembering to edit a marketing file.
 */
export function ProductShowcase({ products }: { readonly products: readonly Product[] }) {
  const listed = products.filter((product) => PRODUCT_PAGE[product.code] !== undefined);

  return (
    <Section labelledBy="products-heading">
      <SectionHeading
        id="products-heading"
        eyebrow="Accounts"
        title="Four accounts, priced in public"
        description="Every rate, fee and limit below comes from the same catalogue the bank runs on."
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {listed.map((product) => {
          const headline = headlineFor(product);
          const href = PRODUCT_PAGE[product.code];
          if (!href) return null;

          return (
            <ProductCard
              key={product.code}
              name={product.name}
              tagline={product.tagline}
              href={href}
              headline={headline.value}
              headlineLabel={headline.label}
              features={product.features.slice(0, FEATURE_LIMIT)}
              badge={product.code === FEATURED_CODE ? 'Most opened' : undefined}
            />
          );
        })}
      </ul>
    </Section>
  );
}
