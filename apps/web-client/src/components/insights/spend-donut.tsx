'use client';

/**
 * Where the money went, as a ring.
 *
 * The ring is geometry and nothing else: it is `aria-hidden` inside its frame, and every figure a
 * customer reads comes from `MoneyText` in the legend beside it or the table beneath it. The
 * conversion from `bigint` minor units to a JavaScript number happens here and only here, because
 * an arc length is the one place a rounded value is harmless — the numbers next to it are exact.
 *
 * Slices are ordered largest first and share the Okabe–Ito palette, so the ring stays readable
 * for a customer with colour vision deficiency. The legend repeats every label in text, so the
 * colour is a scanning aid rather than the message.
 */

import { Pie, PieChart, ResponsiveContainer } from 'recharts';

import type { CurrencyCode } from '@reliance/money';
import { MoneyText, cn } from '@reliance/ui';

import { CATEGORY_LABEL } from '@/components/transactions/labels';
import type { CategoryTotal } from '@/components/transactions/totals';

import { seriesColour } from './chart-palette';
import { useChartAnimation } from './use-reduced-motion';

/** Categories drawn individually before the tail is grouped into "Everything else". */
const MAX_SLICES = 7;

const INNER_RADIUS = '58%';
const OUTER_RADIUS = '86%';
const PADDING_ANGLE = 2;

/** A slice: the label, the exact amount, the number the arc is drawn from, and its colour. */
interface Slice {
  readonly key: string;
  readonly label: string;
  readonly minor: bigint;
  readonly value: number;
  /**
   * Per-slice colour, carried on the datum.
   *
   * Recharts reads `fill` off each row, which replaces the deprecated `<Cell>` child and keeps
   * the colour beside the value it belongs to rather than in a parallel array that can slip.
   */
  readonly fill: string;
}

/**
 * Groups the long tail so the ring stays readable.
 *
 * The grouped slice keeps the exact sum of what it replaced, so the legend still adds up to the
 * total — collapsing categories must never lose a penny.
 */
export function toSlices(categories: readonly CategoryTotal[]): readonly Slice[] {
  const head = categories.slice(0, MAX_SLICES).map((entry, index) => ({
    key: entry.category,
    label: CATEGORY_LABEL[entry.category],
    minor: entry.minor,
    value: Number(entry.minor),
    fill: seriesColour(index),
  }));

  const tail = categories.slice(MAX_SLICES);
  if (tail.length === 0) return head;

  const tailMinor = tail.reduce((total, entry) => total + entry.minor, 0n);
  return [
    ...head,
    {
      key: 'other',
      label: `Everything else (${tail.length})`,
      minor: tailMinor,
      value: Number(tailMinor),
      fill: seriesColour(MAX_SLICES),
    },
  ];
}

function Legend({
  slices,
  currency,
}: {
  readonly slices: readonly Slice[];
  readonly currency: CurrencyCode;
}) {
  return (
    <ul className="flex min-w-48 flex-col gap-2">
      {slices.map((slice) => (
        <li key={slice.key} className="flex items-center gap-2 text-sm">
          <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: slice.fill }} />
          <span className="text-fg min-w-0 flex-1 truncate">{slice.label}</span>
          <MoneyText amount={slice.minor.toString()} currency={currency} size="sm" muted />
        </li>
      ))}
    </ul>
  );
}

/** Props for {@link SpendDonut}. */
export interface SpendDonutProps {
  readonly categories: readonly CategoryTotal[];
  readonly currency: CurrencyCode;
  readonly className?: string;
}

/**
 * @example <SpendDonut categories={totals.byCategory} currency={totals.currency} />
 */
export function SpendDonut({ categories, currency, className }: SpendDonutProps) {
  const slices = toSlices(categories);
  const animate = useChartAnimation();

  return (
    <div className={cn('flex h-full flex-col items-center gap-4 sm:flex-row', className)}>
      <div className="h-full min-h-48 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices as Slice[]}
              dataKey="value"
              nameKey="label"
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              paddingAngle={PADDING_ANGLE}
              isAnimationActive={animate}
              stroke="none"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <Legend slices={slices} currency={currency} />
    </div>
  );
}
