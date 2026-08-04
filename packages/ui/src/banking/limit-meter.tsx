/**
 * LimitMeter — how much of a limit has been used.
 *
 * Spending limits, overdraft usage, ATM withdrawal caps. Built on `role="progressbar"` with the
 * *money* in `aria-valuetext`, because "68 percent" is not the number the customer needs; "£680
 * of £1,000 used" is.
 *
 * The percentage is computed in `bigint` and only becomes a number as a CSS width. That is the
 * one place a rounded value is harmless: the bar is an illustration, and the figures beside it
 * are exact.
 */

import { formatMinor, type CurrencyCode } from '@reliance/money';

import { cn } from '../lib/cn.js';
import { toMinorUnits } from '../lib/minor-units.js';

import { MoneyText } from './money-text.js';

const PERCENT = 100n;
const FULL = 100;

/** Above this, the meter warns; at or over the limit it turns to the debit colour. */
const WARN_AT = 80;

/**
 * Integer percentage of `limit` consumed by `used`, clamped to 0–100.
 *
 * Both amounts are bigint minor units, so the division is exact until the deliberate final
 * truncation. A float division here would be the only imprecise step in the whole component.
 */
export function usedPercent(used: bigint, limit: bigint): number {
  if (limit <= 0n) return 0;
  const clamped = used < 0n ? 0n : used;
  const capped = clamped > limit ? limit : clamped;
  return Number((capped * PERCENT) / limit);
}

/** Green while there is room, gold as it runs out, debit red once it is gone. */
function fillClass(percent: number): string {
  if (percent >= FULL) return 'bg-debit';
  return percent >= WARN_AT ? 'bg-pending' : 'bg-accent';
}

export interface LimitMeterProps {
  /** What the limit governs — "Daily card spending". */
  readonly label: string;
  /** Minor units. */
  readonly used: string;
  /** Minor units. */
  readonly limit: string;
  readonly currency: CurrencyCode;
  /** Extra line under the bar, e.g. "Resets at midnight". */
  readonly hint?: string;
  readonly className?: string;
}

/**
 * @example <LimitMeter label="Daily card spending" used="68000" limit="100000" currency="GBP" />
 */
export function LimitMeter({ label, used, limit, currency, hint, className }: LimitMeterProps) {
  const usedMinor = toMinorUnits(used);
  const limitMinor = toMinorUnits(limit);
  const percent = usedPercent(usedMinor, limitMinor);
  // The bar's own value is a percentage; the number the customer needs is the money, so it goes
  // in `aria-valuetext` where it replaces "68 percent" in the announcement.
  const valueText = `${formatMinor(usedMinor, currency)} of ${formatMinor(limitMinor, currency)} used`;

  return (
    <div className={cn('font-body flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg">{label}</span>
        <span className="text-fg-muted">
          <MoneyText amount={used} currency={currency} size="sm" muted /> of{' '}
          <MoneyText amount={limit} currency={currency} size="sm" muted />
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={FULL}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        aria-label={label}
        className="rounded-pill bg-surface-sunken h-2 w-full overflow-hidden"
      >
        <div
          className={cn(
            'rounded-pill ease-standard h-full transition-[width] duration-(--rb-duration-base)',
            fillClass(percent),
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {hint && <p className="text-fg-muted text-xs">{hint}</p>}
    </div>
  );
}
