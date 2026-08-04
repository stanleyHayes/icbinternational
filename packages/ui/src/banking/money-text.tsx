/**
 * MoneyText — every monetary figure the customer ever sees.
 *
 * Three guarantees, in order of importance:
 *
 * 1. **It cannot render a float.** The amount arrives as a string of integer minor units and is
 *    parsed with `toMinorUnits`, which throws on anything else. Formatting is delegated to
 *    `@reliance/money`, which walks a `bigint` through `Intl.NumberFormat` without ever creating
 *    a JavaScript number. There is no code path from this component to `parseFloat`, `Number()`
 *    or arithmetic on a `number`.
 * 2. **The digits do not jitter.** `tabular-nums` plus the brand's numeric feature settings, so a
 *    balance that updates from £1,111.11 to £8,888.88 does not reflow the row it sits in.
 * 3. **Colour follows the brand's money semantics**, never the caller's preference: credit green,
 *    debit `#D9534F`, pending gold, zero neutral.
 */

import { formatMinor, type CurrencyCode, type CurrencyDisplay } from '@reliance/money';

import { TABULAR } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';
import { toMinorUnits } from '../lib/minor-units.js';

import { moneyDirection, moneyTextClass } from './money-tone.js';

export type MoneyTextSize = 'sm' | 'base' | 'lg' | 'xl' | 'display';

const SIZE: Readonly<Record<MoneyTextSize, string>> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg font-medium',
  xl: 'text-2xl font-semibold',
  display: 'font-display text-4xl font-semibold tracking-tight',
};

export interface MoneyTextProps {
  /**
   * Signed integer **minor units**, as a string: `"125000"` is £1,250.00.
   *
   * @throws {InvalidMinorUnitsError} if it is not `/^-?\d+$/` — including if a float slips
   * through an untyped API response.
   */
  readonly amount: string;
  readonly currency: CurrencyCode;
  /** BCP 47 locale. Defaults to the `@reliance/money` default. */
  readonly locale?: string;
  /** How the currency is shown. `'none'` renders digits only, for columns with a header. */
  readonly display?: CurrencyDisplay;
  readonly size?: MoneyTextSize;
  /** Forces a leading `+` on credits — used in transaction lists where direction is the point. */
  readonly signed?: boolean;
  /** Authorised but not settled: renders gold regardless of sign. */
  readonly pending?: boolean;
  /** Renders in the inherited colour. For figures whose direction is already stated in words. */
  readonly muted?: boolean;
  /** Accessible prefix, e.g. "Available balance". Read before the figure. */
  readonly srLabel?: string;
  readonly className?: string;
}

/**
 * @example
 * <MoneyText amount="-2450" currency="GBP" signed />        // −£24.50, in debit red
 * <MoneyText amount="0" currency="USD" size="display" />    // $0.00, neutral
 */
export function MoneyText(props: MoneyTextProps) {
  const {
    amount,
    currency,
    locale,
    display,
    size = 'base',
    signed,
    pending,
    muted,
    srLabel,
  } = props;

  const minor = toMinorUnits(amount);
  const direction = moneyDirection(minor, pending);

  const text = formatMinor(minor, currency, {
    ...(locale ? { locale } : {}),
    ...(display ? { display } : {}),
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  });

  return (
    <span
      // The machine-readable amount travels with the rendered text so tests, exports and any
      // future copy-to-clipboard read the exact minor units rather than re-parsing a formatted,
      // localised, possibly-grouped string.
      data-amount={amount}
      data-currency={currency}
      data-direction={direction}
      className={cn(
        TABULAR,
        'tabular-nums',
        SIZE[size],
        !muted && moneyTextClass(direction),
        props.className,
      )}
    >
      {srLabel && <span className="sr-only">{srLabel} </span>}
      {text}
    </span>
  );
}
