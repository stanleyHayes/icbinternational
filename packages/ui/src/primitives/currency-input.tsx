'use client';

/**
 * The amount field.
 *
 * Its state is a string of **integer minor units** and nothing else. There is no float anywhere
 * in this component — not in the value, not in an intermediate, not in the display path. The
 * behaviour lives in `useCurrencyField`; this file is the control it drives.
 */

import { forwardRef, type InputHTMLAttributes } from 'react';

import { getCurrency, type CurrencyCode } from '@reliance/money';

import {
  DISABLED,
  FIELD_BASE,
  FOCUS_RING,
  TABULAR,
  TRANSITION_STATE,
} from '../foundation/styles.js';
import { useMergedRefs } from '../hooks/use-merged-refs.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';
import { useCurrencyField } from './use-currency-field.js';

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'size'
>;

export interface CurrencyInputProps extends NativeProps {
  readonly currency: CurrencyCode;
  /** Controlled amount, in minor units. `''` means "nothing entered", which is not the same as 0. */
  readonly value?: string;
  readonly defaultValue?: string;
  /** Receives minor units — pass straight to `Money.fromMinor(value, currency)`. */
  readonly onValueChange?: (minorUnits: string) => void;
  /** Permits a leading `-`. Off by default: most amount fields are magnitudes. */
  readonly allowNegative?: boolean;
}

const INPUT_CLASSES = cn(
  FIELD_BASE,
  TABULAR,
  'h-12 pl-9 text-right text-xl font-medium tabular-nums',
  FOCUS_RING,
  TRANSITION_STATE,
  DISABLED,
);

/**
 * @example
 * <CurrencyInput currency="GBP" value={amount} onValueChange={setAmount} />
 * // amount is "125000" — never 1250.00
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(props, ref) {
    // Every controlled prop is destructured out: whatever remains is spread onto the input, and
    // a stray `value` reaching the DOM would overwrite the formatted text with raw minor units.
    const {
      currency,
      allowNegative = false,
      className,
      placeholder,
      value,
      defaultValue,
      onValueChange,
      ...rest
    } = props;

    const field = useFieldControl();
    const amount = useCurrencyField({
      currency,
      allowNegative,
      value,
      defaultValue,
      onValueChange,
    });
    const mergedRef = useMergedRefs(ref, amount.ref);

    return (
      <div className="relative flex items-center">
        <span aria-hidden="true" className="text-fg-muted pointer-events-none absolute left-3">
          {getCurrency(currency).symbol}
        </span>
        <input
          ref={mergedRef}
          type="text"
          // `decimal` rather than `numeric`: it offers a keypad with a separator on iOS, which is
          // what people expect of an amount field even though the separator is ignored here.
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ?? amount.zero}
          value={amount.text}
          onChange={amount.onChange}
          className={cn(INPUT_CLASSES, className)}
          {...field}
          {...rest}
        />
      </div>
    );
  },
);
