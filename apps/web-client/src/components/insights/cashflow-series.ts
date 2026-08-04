/**
 * Turning the API's cash-flow buckets into something a chart can draw.
 *
 * Amounts arrive as integer minor units and become JavaScript numbers here, at the boundary of
 * the plotting library — a bar height and an axis tick are geometry, and geometry is the one
 * place a rounded value is harmless. Every figure the customer *reads* keeps its exact minor
 * units and goes through `MoneyText`, which is why both forms travel together in each point.
 */

import type { Cashflow } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** One month on the cash-flow chart. */
export interface CashflowPoint {
  /** `2026-07`, as the API buckets it. */
  readonly period: string;
  /** `Jul 2026`, for the axis and the table. */
  readonly label: string;
  readonly inValue: number;
  readonly outValue: number;
  readonly netValue: number;
  readonly balanceValue: number;
  /** Exact minor units, for every rendered figure. */
  readonly inMinor: string;
  readonly outMinor: string;
  readonly netMinor: string;
  readonly balanceMinor: string;
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

/** `2026-07` → `Jul 2026`. Falls back to the raw bucket if it is not a month. */
export function monthLabel(period: string): string {
  const parsed = new Date(`${period}-01T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? period : MONTH_FORMAT.format(parsed);
}

/**
 * Money out is negated so the bars point downwards.
 *
 * The API reports it as a positive magnitude, which is right for a ledger and wrong for a chart:
 * two positive bars side by side make an outflow look like income.
 */
export function toCashflowSeries(cashflow: Cashflow): readonly CashflowPoint[] {
  return cashflow.buckets.map((bucket) => {
    const outMagnitude = BigInt(bucket.moneyOut.amount);
    const out = outMagnitude < 0n ? outMagnitude : -outMagnitude;

    return {
      period: bucket.period,
      label: monthLabel(bucket.period),
      inValue: Number(bucket.moneyIn.amount),
      outValue: Number(out),
      netValue: Number(bucket.net.amount),
      balanceValue: Number(bucket.closingBalance.amount),
      inMinor: bucket.moneyIn.amount,
      outMinor: out.toString(),
      netMinor: bucket.net.amount,
      balanceMinor: bucket.closingBalance.amount,
    };
  });
}

/** The currency a cash-flow response is reported in. */
export function cashflowCurrency(cashflow: Cashflow): CurrencyCode {
  return cashflow.currency;
}
