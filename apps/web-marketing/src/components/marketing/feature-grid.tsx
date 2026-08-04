import type { LucideIcon } from 'lucide-react';

import { cn } from '@reliance/ui';

const ICON_SIZE = 20;

/** Supported column counts, and the responsive class each one needs. */
const COLUMN_CLASS = {
  two: 'sm:grid-cols-2',
  three: 'sm:grid-cols-2 lg:grid-cols-3',
  four: 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

/** How many columns the grid uses at its widest. */
export type FeatureColumns = keyof typeof COLUMN_CLASS;

/** One capability, stated as a benefit rather than a feature name. */
export interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

/**
 * A grid of capabilities.
 *
 * Icons are decorative and marked as such: the title beside them already carries the
 * meaning, and an icon announced as "shield" adds a word the customer has to discard.
 */
export function FeatureGrid({
  features,
  columns = 'three',
  className,
}: {
  readonly features: readonly Feature[];
  readonly columns?: FeatureColumns;
  readonly className?: string;
}) {
  return (
    <ul className={cn('grid gap-x-8 gap-y-10', COLUMN_CLASS[columns], className)}>
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <li key={feature.title}>
            <span className="bg-accent-soft text-accent grid size-10 place-items-center rounded-lg">
              <Icon size={ICON_SIZE} aria-hidden />
            </span>
            <h3 className="font-display text-fg mt-4 text-lg font-semibold">{feature.title}</h3>
            <p className="text-fg-muted mt-2 leading-relaxed">{feature.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
