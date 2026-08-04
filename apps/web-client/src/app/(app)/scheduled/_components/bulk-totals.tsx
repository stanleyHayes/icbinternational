'use client';

/**
 * What the file adds up to.
 *
 * The total is computed in `bigint` minor units and only ever rendered through `MoneyText`, so the
 * figure a customer approves is exact to the penny however many rows the file has. Rows that
 * cannot be sent are excluded from the total and counted separately, because a total that quietly
 * includes rows the bank will refuse is a number nobody can reconcile.
 */

import { Money, type CurrencyCode } from '@reliance/money';
import { MoneyText } from '@reliance/ui';

import type { ParsedRow } from './parse-csv';

/** Props for {@link BulkTotals}. */
export interface BulkTotalsProps {
  readonly rows: readonly ParsedRow[];
  readonly currency: string;
}

/** The sum of every row that can actually be sent. */
function payableTotal(rows: readonly ParsedRow[], currency: CurrencyCode): Money {
  return rows
    .filter((row) => row.problem === null)
    .reduce(
      (total, row) => total.plus(Money.fromMinor(row.amount, currency)),
      Money.zero(currency),
    );
}

/**
 * @example <BulkTotals rows={rows} currency="GBP" />
 */
export function BulkTotals({ rows, currency }: BulkTotalsProps) {
  const code = currency as CurrencyCode;
  const valid = rows.filter((row) => row.problem === null).length;
  const invalid = rows.length - valid;
  const total = payableTotal(rows, code);

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div className="border-border rounded-md border p-4">
        <dt className="text-fg-muted text-sm">Payments ready to send</dt>
        <dd className="font-display text-fg mt-1 text-2xl font-semibold tabular-nums">{valid}</dd>
      </div>
      <div className="border-border rounded-md border p-4">
        <dt className="text-fg-muted text-sm">Rows that need fixing</dt>
        <dd className="font-display text-fg mt-1 text-2xl font-semibold tabular-nums">
          {invalid}
          {invalid > 0 ? (
            <span className="text-danger ml-2 text-sm font-normal">Not sent</span>
          ) : null}
        </dd>
      </div>
      <div className="border-border rounded-md border p-4">
        <dt className="text-fg-muted text-sm">Total to be paid</dt>
        <dd className="mt-1">
          <MoneyText
            amount={total.toJSON().amount}
            currency={code}
            size="xl"
            srLabel="Total of every payment that can be sent"
          />
        </dd>
      </div>
    </dl>
  );
}
