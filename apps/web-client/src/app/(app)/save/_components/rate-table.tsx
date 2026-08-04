'use client';

/**
 * The fixed-deposit rate board.
 *
 * A real table, because that is what it is: a screen reader should be able to say "18 months,
 * 4.35%, minimum £1,000" rather than reading three columns of unlabelled figures. Rates are held
 * as basis points and rendered from them, so 4.35% is exact rather than a float that renders as
 * 4.3499999.
 */

import type { DepositRate } from '@reliance/contracts';
import { MoneyText, Table, type TableColumn } from '@reliance/ui';

const BPS_PER_PERCENT = 100;
const PERCENT_DECIMALS = 2;
const MONTHS_PER_YEAR = 12;

/** Basis points as a percentage, exactly. */
export function percentFromBps(bps: number): string {
  return `${(bps / BPS_PER_PERCENT).toFixed(PERCENT_DECIMALS)}%`;
}

/** A term in the words people use for it. */
export function termLabel(months: number): string {
  if (months < MONTHS_PER_YEAR) return `${months} months`;
  const years = months / MONTHS_PER_YEAR;
  return years === 1 ? '1 year' : `${years} years`;
}

const COLUMNS: TableColumn<DepositRate>[] = [
  { id: 'term', header: 'Term', cell: (rate) => termLabel(rate.termMonths) },
  {
    id: 'rate',
    header: 'Annual rate',
    align: 'end',
    cell: (rate) => <span className="tabular-nums">{percentFromBps(rate.annualRateBps)}</span>,
  },
  {
    id: 'minimum',
    header: 'Minimum',
    align: 'end',
    cell: (rate) => (
      <MoneyText amount={rate.minAmount.amount} currency={rate.minAmount.currency} muted />
    ),
  },
];

/** Props for {@link RateTable}. */
export interface RateTableProps {
  readonly rates: readonly DepositRate[];
}

/**
 * @example <RateTable rates={rates} />
 */
export function RateTable({ rates }: RateTableProps) {
  return (
    <Table
      caption="Fixed-deposit rates by term"
      columns={COLUMNS}
      rows={rates}
      rowKey={(rate) => String(rate.termMonths)}
    />
  );
}
