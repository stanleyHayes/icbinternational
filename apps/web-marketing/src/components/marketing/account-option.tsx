'use client';

import { Check } from 'lucide-react';

import type { Product } from '@reliance/contracts';
import { cn, FOCUS_RING } from '@reliance/ui';

const ICON_SIZE = 16;
const FEATURE_LIMIT = 4;

function OptionFeatures({ features }: { readonly features: readonly string[] }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {features.slice(0, FEATURE_LIMIT).map((feature) => (
        <li key={feature} className="text-fg-muted flex items-start gap-2 text-sm">
          <Check size={ICON_SIZE} aria-hidden className="text-accent mt-0.5 shrink-0" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

/** One choosable account in the funnel. The whole card is the radio's label. */
export function AccountOption({
  product,
  selected,
  onSelect,
}: {
  readonly product: Product;
  readonly selected: boolean;
  readonly onSelect: (code: string) => void;
}) {
  return (
    <li>
      <label
        className={cn(
          'bg-surface flex h-full cursor-pointer flex-col rounded-xl border-2 p-5',
          'transition-colors duration-(--rb-duration-fast)',
          selected ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-fg text-lg font-semibold">{product.name}</span>
          <input
            type="radio"
            name="product"
            value={product.code}
            checked={selected}
            onChange={() => onSelect(product.code)}
            className={cn('mt-1 size-4 accent-[var(--rb-color-accent)]', FOCUS_RING)}
          />
        </span>
        <span className="text-fg-muted mt-1 text-sm leading-relaxed">{product.tagline}</span>

        <OptionFeatures features={product.features} />
      </label>
    </li>
  );
}
