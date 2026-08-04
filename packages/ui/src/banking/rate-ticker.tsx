/**
 * RateTicker — an FX pair and its movement.
 *
 * The rate arrives as a scaled integer string with its scale, matching `@reliance/money`'s
 * `ExchangeRate`: a rate is a ratio, and rendering it through a float is how a quote and a
 * settlement end up disagreeing in the sixth decimal place.
 *
 * Movement colour follows the money rule — up is green, down is the debit red — with an arrow and
 * a signed figure beside it, because a red number that is only red says nothing to a third of
 * colour-blind users.
 */

import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '../foundation/icons.js';
import { TABULAR } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

/** Direction of the last move. */
export type RateTrend = 'up' | 'down' | 'flat';

const TREND_CLASS: Readonly<Record<RateTrend, string>> = {
  up: 'text-credit',
  down: 'text-debit',
  flat: 'text-fg-muted',
};

const TREND_ICON = { up: ArrowUpIcon, down: ArrowDownIcon, flat: MinusIcon };

/** Announced instead of the bare arrow, which a screen reader would skip entirely. */
const TREND_TEXT: Readonly<Record<RateTrend, string>> = {
  up: 'up',
  down: 'down',
  flat: 'unchanged',
};

export interface RateTickerProps {
  /** Base currency of the pair, e.g. `GBP`. */
  readonly base: string;
  /** Quote currency, e.g. `EUR`. */
  readonly quote: string;
  /** The rate, already formatted for display — `formatRate` from `@reliance/money`. */
  readonly rate: string;
  readonly trend?: RateTrend;
  /** Signed change, formatted, e.g. `"+0.0012"` or `"-0.31%"`. */
  readonly change?: string;
  /** When the rate was quoted, already formatted. */
  readonly asOf?: string;
  readonly className?: string;
}

/**
 * @example
 * <RateTicker base="GBP" quote="EUR" rate="1.1642" trend="up" change="+0.0031" asOf="14:02" />
 */
export function RateTicker({
  base,
  quote,
  rate,
  trend = 'flat',
  change,
  asOf,
  className,
}: RateTickerProps) {
  const TrendIcon = TREND_ICON[trend];

  return (
    <div className={cn('font-body flex items-center justify-between gap-4', className)}>
      <div className="flex flex-col">
        <span className="font-display text-fg text-sm font-semibold">
          {base}/{quote}
        </span>
        {asOf && <span className="text-fg-muted text-xs">as of {asOf}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(TABULAR, 'text-fg text-lg font-medium tabular-nums')}>{rate}</span>
        <span className={cn('flex items-center gap-1 text-sm tabular-nums', TREND_CLASS[trend])}>
          <TrendIcon className="size-3.5" />
          <span className="sr-only">{TREND_TEXT[trend]}</span>
          {change}
        </span>
      </div>
    </div>
  );
}
