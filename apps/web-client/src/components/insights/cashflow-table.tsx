'use client';

/**
 * The cash-flow figures, as a table.
 *
 * Serves both charts on the page — the bars and the balance line are two views of these same
 * four columns, so publishing one table rather than two removes any chance of the accessible
 * version of the bars disagreeing with the accessible version of the line.
 */

import type { CurrencyCode } from '@reliance/money';
import { MoneyText } from '@reliance/ui';

import type { CashflowPoint } from './cashflow-series';
import { DataTable, Figure, RowHeader, TableHead } from './table-parts';

const HEADINGS: readonly string[] = ['Month', 'Money in', 'Money out', 'Net', 'Closing balance'];

function Row({
  point,
  currency,
}: {
  readonly point: CashflowPoint;
  readonly currency: CurrencyCode;
}) {
  return (
    <tr className="border-border border-b last:border-0">
      <RowHeader>{point.label}</RowHeader>
      <Figure>
        <MoneyText amount={point.inMinor} currency={currency} size="sm" />
      </Figure>
      <Figure>
        <MoneyText amount={point.outMinor} currency={currency} size="sm" signed />
      </Figure>
      <Figure>
        <MoneyText amount={point.netMinor} currency={currency} size="sm" signed />
      </Figure>
      <Figure>
        <MoneyText amount={point.balanceMinor} currency={currency} size="sm" muted />
      </Figure>
    </tr>
  );
}

/** Props for {@link CashflowTable}. */
export interface CashflowTableProps {
  readonly points: readonly CashflowPoint[];
  readonly currency: CurrencyCode;
}

/**
 * @example <CashflowTable points={points} currency="GBP" />
 */
export function CashflowTable({ points, currency }: CashflowTableProps) {
  return (
    <DataTable
      caption={`Money in, money out and the closing balance for each month, in ${currency}.`}
    >
      <TableHead headings={HEADINGS} />
      <tbody>
        {points.map((point) => (
          <Row key={point.period} point={point} currency={currency} />
        ))}
      </tbody>
    </DataTable>
  );
}
