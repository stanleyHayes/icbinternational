import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { cn, FOCUS_RING } from '@reliance/ui';

import type { SiteHref } from '@/lib/routes';

const ICON_SIZE = 16;

export interface ProductCardProps {
  readonly name: string;
  readonly tagline: string;
  readonly href: SiteHref;
  /** The one figure that decides it: a rate, a fee, a representative APR. */
  readonly headline: string;
  readonly headlineLabel: string;
  readonly features: readonly string[];
  /** Raises the card and names why it stands out. Use on at most one card in a grid. */
  readonly badge?: string;
}

function FeatureList({ features }: { readonly features: readonly string[] }) {
  return (
    <ul className="mt-5 grow space-y-2">
      {features.map((feature) => (
        <li key={feature} className="text-fg-muted flex items-start gap-2 text-sm">
          <Check size={ICON_SIZE} aria-hidden className="text-accent mt-0.5 shrink-0" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

/**
 * A product, as the catalogue shows it.
 *
 * The whole card is one link rather than a card with a link inside it. A screen-reader
 * user gets one target with the product's name, not four fragments; a mouse user gets a
 * hit area the size of the card.
 *
 * The card renders the link only: the `<li>` around it belongs to the grid that lists it,
 * where the scroll-reveal wrapper stands in for it. `h-full` there keeps cards level.
 */
export function ProductCard(props: ProductCardProps) {
  const { name, tagline, href, headline, headlineLabel, features, badge } = props;

  return (
    <Link
      href={href}
      className={cn(
        'group bg-surface flex h-full flex-col rounded-xl border p-6 transition-all',
        'ease-standard duration-(--rb-duration-base) hover:-translate-y-0.5 hover:shadow-md',
        badge ? 'border-accent shadow-sm' : 'border-border',
        FOCUS_RING,
      )}
    >
      {badge ? (
        <span className="rounded-pill bg-accent-soft text-accent mb-3 w-fit px-2.5 py-1 text-xs font-semibold">
          {badge}
        </span>
      ) : null}

      <h3 className="font-display text-fg text-xl font-semibold">{name}</h3>
      <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{tagline}</p>

      <p className="mt-5">
        <span className="font-display text-fg block text-3xl font-semibold">{headline}</span>
        <span className="text-fg-subtle mt-1 block text-sm">{headlineLabel}</span>
      </p>

      <FeatureList features={features} />

      <span className="text-accent mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
        Learn more
        <ArrowRight
          size={ICON_SIZE}
          aria-hidden
          className="transition-transform duration-(--rb-duration-fast) group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
