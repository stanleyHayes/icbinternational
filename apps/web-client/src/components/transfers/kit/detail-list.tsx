'use client';

/**
 * Label-and-value pairs — the review screen, the receipt, the "about this account" block.
 *
 * A description list, because that is exactly what it is. The alternative every dashboard reaches
 * for is a grid of divs, which reads to a screen reader as an unbroken run of words with no way to
 * tell which value belongs to which label. On a payment review that is the difference between
 * "fee, £3.50" and "£3.50" arriving somewhere in the middle of a sentence.
 */

import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

/** One row of a {@link DetailList}. */
export interface Detail {
  /** Stable key, and the label when `label` is omitted. */
  readonly id: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** Small print under the value — an arrival estimate, a caveat, a reference. */
  readonly note?: ReactNode;
}

/** Props for {@link DetailList}. */
export interface DetailListProps {
  readonly items: readonly Detail[];
  /** Stacks label above value. Use in a narrow column where two columns would wrap badly. */
  readonly stacked?: boolean;
  readonly className?: string;
}

/**
 * @example
 * <DetailList items={[{ id: 'fee', label: 'Fee', value: <MoneyText … /> }]} />
 */
export function DetailList({ items, stacked = false, className }: DetailListProps) {
  return (
    <dl className={cn('divide-border flex flex-col divide-y', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'gap-1 py-3 first:pt-0 last:pb-0',
            stacked ? 'flex flex-col' : 'flex flex-wrap items-baseline justify-between gap-x-6',
          )}
        >
          <dt className="text-fg-muted text-sm">{item.label}</dt>
          <dd className={cn('text-fg min-w-0 text-sm font-medium', !stacked && 'text-right')}>
            {item.value}
            {item.note ? (
              <span className="text-fg-subtle mt-0.5 block text-xs font-normal">{item.note}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
