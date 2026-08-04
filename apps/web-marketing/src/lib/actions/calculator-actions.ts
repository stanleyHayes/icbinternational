'use server';

/**
 * The two public calculators.
 *
 * Neither does any arithmetic here. The amount the customer types is parsed to integer
 * minor units by `@reliance/money` and handed to the same endpoint the customer app uses,
 * so the monthly payment shown on a marketing page is the payment the loan actually
 * carries. A calculator that computed its own answer in the browser would agree with the
 * bank to within a penny or two, and the first person to notice the difference would be
 * someone comparing this page with their statement.
 */

import type { SavingsProjection } from '@reliance/api-client';
import type { LoanQuote } from '@reliance/contracts';
import { parseMajorToMinor, type CurrencyCode } from '@reliance/money';

import { publicApi } from '@/lib/api/client';

import { failed, fromApiFailure, type FormState } from './form-state';

/** Everything the calculators quote in. */
const CURRENCY: CurrencyCode = 'GBP';

const AMOUNT_INVALID = 'Enter an amount, for example 12,500.';
const AMOUNT_TOO_SMALL = 'Enter an amount above zero.';

/** What the loan calculator is asked. */
export interface LoanCalculatorInput {
  readonly productCode: string;
  /** Major units as typed, e.g. `"12,500"`. Parsed to minor units before it leaves. */
  readonly amount: string;
  readonly termMonths: number;
}

/** What the savings calculator is asked. */
export interface SavingsCalculatorInput {
  readonly initialDeposit: string;
  readonly monthlyContribution: string;
  readonly annualRateBps: number;
  readonly months: number;
}

/** A calculator answer: either the figures, or a reason there are none. */
export type CalculatorResult<T> =
  | { readonly ok: true; readonly quote: T }
  | { readonly ok: false; readonly error: FormState };

/**
 * Parses a typed amount into minor units.
 *
 * `parseMajorToMinor` throws on anything that is not a decimal amount, which is exactly
 * the behaviour wanted: a silently coerced `NaN` becomes a quote for nothing.
 */
function toMinor(value: string, allowZero: boolean): bigint | null {
  try {
    const minor = parseMajorToMinor(value.replaceAll(',', ''), CURRENCY);
    if (minor < 0n || (!allowZero && minor === 0n)) return null;
    return minor;
  } catch {
    return null;
  }
}

/** Quotes a loan. */
export async function calculateLoanAction(
  input: LoanCalculatorInput,
): Promise<CalculatorResult<LoanQuote>> {
  const minor = toMinor(input.amount, false);
  if (minor === null) {
    return { ok: false, error: failed(AMOUNT_INVALID, { amount: AMOUNT_TOO_SMALL }) };
  }

  try {
    const { data } = await publicApi().public.loanCalculator({
      productCode: input.productCode,
      amount: { amount: minor.toString(), currency: CURRENCY },
      termMonths: input.termMonths,
    });
    return { ok: true, quote: data };
  } catch (error) {
    return { ok: false, error: fromApiFailure(error) };
  }
}

/** Projects savings growth. */
export async function calculateSavingsAction(
  input: SavingsCalculatorInput,
): Promise<CalculatorResult<SavingsProjection>> {
  const initial = toMinor(input.initialDeposit, true);
  const monthly = toMinor(input.monthlyContribution, true);

  if (initial === null || monthly === null) {
    return { ok: false, error: failed(AMOUNT_INVALID, { initialDeposit: AMOUNT_INVALID }) };
  }

  try {
    const { data } = await publicApi().public.savingsCalculator({
      initialDeposit: { amount: initial.toString(), currency: CURRENCY },
      monthlyContribution: { amount: monthly.toString(), currency: CURRENCY },
      annualRateBps: input.annualRateBps,
      months: input.months,
    });
    return { ok: true, quote: data };
  } catch (error) {
    return { ok: false, error: fromApiFailure(error) };
  }
}
