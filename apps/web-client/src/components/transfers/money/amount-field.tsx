'use client';

/**
 * The amount a customer types.
 *
 * A thin wrapper over the design system's `CurrencyInput` that adds the two things every amount
 * field in a bank needs and none of them have by default: the currency is stated in the label, and
 * a value that exceeds the available balance is refused *here*, before the review screen, with the
 * shortfall named in money.
 *
 * The value is a string of integer minor units throughout. No float is created at any point.
 */

import { Money, type CurrencyCode } from '@reliance/money';
import { CurrencyInput, FormField } from '@reliance/ui';

/** Props for {@link AmountField}. */
export interface AmountFieldProps {
  readonly label: string;
  readonly currency: CurrencyCode;
  /** Integer minor units. `''` means nothing has been entered, which is not the same as zero. */
  readonly value: string;
  readonly onChange: (minorUnits: string) => void;
  /** Available balance in minor units. Supply it and the field enforces it. */
  readonly available?: string;
  readonly hint?: string;
  /** Overrides the derived message — a server-side rejection, say. */
  readonly error?: string;
  readonly disabled?: boolean;
}

/** The shortfall message, or null when the amount is affordable. */
export function overBalanceMessage(
  value: string,
  available: string | undefined,
  currency: CurrencyCode,
): string | null {
  if (!value || available === undefined) return null;

  const entered = Money.fromMinor(value, currency);
  const headroom = Money.fromMinor(available, currency);
  if (entered.lessThanOrEqual(headroom)) return null;

  return `That is ${entered.minus(headroom).format()} more than the available balance on this account.`;
}

/**
 * @example
 * <AmountField label="Amount" currency="GBP" value={minor} onChange={setMinor} available={free} />
 */
export function AmountField(props: AmountFieldProps) {
  const { label, currency, value, onChange, available, hint, disabled } = props;
  const message = props.error ?? overBalanceMessage(value, available, currency) ?? null;

  return (
    <FormField
      label={`${label} in ${currency}`}
      error={message}
      required
      {...(hint ? { hint } : {})}
    >
      <CurrencyInput
        currency={currency}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </FormField>
  );
}
