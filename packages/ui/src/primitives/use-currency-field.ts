'use client';

/**
 * The state machine behind CurrencyInput.
 *
 * Its whole job is to keep a monetary value in **integer minor units** while a human types into a
 * text box. Entry behaves like a card terminal: digits fill from the right, so `1`,`2`,`3` in a
 * two-decimal currency reads £0.01 → £0.12 → £1.23. That model never leaves the user mid-edit
 * with an ambiguous `"12."`, and it removes the decimal separator — and its locale — as a source
 * of ambiguity entirely.
 *
 * No float exists at any point: the value is a digit string, the display comes from
 * `@reliance/money` walking a `bigint` through `Intl.NumberFormat`.
 */

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';

import { formatMinor, type CurrencyCode } from '@reliance/money';

import { useControllableState } from '../hooks/use-controllable-state.js';
import { digitsOnly, isMinorUnits } from '../lib/minor-units.js';

const LEADING_ZEROS = /^0+(?=\d)/;
const MINUS = '-';

/**
 * Displayed text for an amount.
 *
 * An empty value shows a lone `-` once the sign has been typed but no digits have. The sign has
 * to survive on screen: the next keystroke's raw value is read back from the input, so a `-` that
 * was silently dropped could never be re-entered.
 */
function display(minorUnits: string, currency: CurrencyCode, negative: boolean): string {
  if (!isMinorUnits(minorUnits)) return negative ? MINUS : '';
  return formatMinor(BigInt(minorUnits), currency, { display: 'none' });
}

/** Keystrokes → minor units. Digits only; the sign is carried separately, never parsed. */
function toNextValue(raw: string, negative: boolean): string {
  const digits = digitsOnly(raw).replace(LEADING_ZEROS, '');
  if (digits.length === 0) return '';
  return negative ? `${MINUS}${digits}` : digits;
}

export interface CurrencyFieldOptions {
  readonly currency: CurrencyCode;
  readonly allowNegative: boolean;
  readonly value: string | undefined;
  readonly defaultValue: string | undefined;
  readonly onValueChange: ((minorUnits: string) => void) | undefined;
}

export interface CurrencyField {
  /** The formatted text the input displays. */
  readonly text: string;
  /** Placeholder showing a zero amount in the right shape for the currency. */
  readonly zero: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly ref: RefObject<HTMLInputElement | null>;
}

/** Owns the amount, the sign, and the caret. */
export function useCurrencyField(options: CurrencyFieldOptions): CurrencyField {
  const { currency, allowNegative } = options;
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useControllableState<string>({
    value: options.value,
    defaultValue: options.defaultValue ?? '',
    onChange: options.onValueChange,
  });

  // The sign lives outside the amount so it can exist before any digit does.
  const [negative, setNegative] = useState(false);
  const text = display(value, currency, negative);

  // Digits fill from the right, so the caret belongs at the end after every keystroke. Without
  // this, inserting a digit mid-string strands the caret before the group separator that
  // reformatting has just moved.
  useEffect(() => {
    const element = ref.current;
    if (element && document.activeElement === element) {
      element.setSelectionRange(text.length, text.length);
    }
  }, [text]);

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value;
    const signed = allowNegative && raw.includes(MINUS);
    setNegative(signed);
    setValue(toNextValue(raw, signed));
  };

  return { text, zero: formatMinor(0n, currency, { display: 'none' }), onChange, ref };
}
