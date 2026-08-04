'use client';

/**
 * The spend breakdown as figures — the accessible half of the donut, and the reconciliation.
 *
 * Every row links into the transaction list with the same window and the same category, so the
 * claim the table makes can be checked in two clicks: open the category, read the total above the
 * list, and it is the number that was on this row. That works because both come from the same
 * `collectTransactions` call over the same filter.
 *
 * The last row is the total. It is the sum of the rows above it, computed from the same `bigint`
 * values rather than read from a separate field, so the table cannot show a total that its own
 * rows contradict.
 */

import Link from 'next/link';

import { TransactionDirection, type SpendCategory } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { MoneyText, cn } from '@reliance/ui';

import type { TransactionFilters } from '@/components/transactions/filters';
import { CATEGORY_LABEL } from '@/components/transactions/labels';
import { transactionsRoute } from '@/components/transactions/routes';
import type { CategoryTotal } from '@/components/transactions/totals';

import { CELL, DataTable, Figure, NUMERIC, RowHeader, TableHead } from './table-parts';

const BPS_PER_PERCENT = 100;
const BPS_PER_TENTH = 10;

const HEADINGS: readonly string[] = ['Category', 'Payments', 'Share', 'Total'];

/** `3333` basis points → `33.3%`. Display only; the money beside it is exact. */
function formatShare(bps: number): string {
  const whole = Math.trunc(bps / BPS_PER_PERCENT);
  const tenth = Math.trunc(Math.abs(bps % BPS_PER_PERCENT) / BPS_PER_TENTH);
  return `${whole}.${tenth}%`;
}

function rowFilters(filters: TransactionFilters, category: SpendCategory): TransactionFilters {
  return { ...filters, category, direction: TransactionDirection.DEBIT };
}

function Row({
  entry,
  currency,
  filters,
}: {
  readonly entry: CategoryTotal;
  readonly currency: CurrencyCode;
  readonly filters: TransactionFilters;
}) {
  return (
    <tr className="border-border border-b last:border-0">
      <RowHeader>
        <Link
          href={transactionsRoute(rowFilters(filters, entry.category))}
          className="text-fg hover:text-accent underline underline-offset-2"
        >
          {CATEGORY_LABEL[entry.category]}
        </Link>
      </RowHeader>
      <Figure>{entry.count}</Figure>
      <Figure>{formatShare(entry.shareBps)}</Figure>
      <Figure>
        <MoneyText amount={entry.minor.toString()} currency={currency} size="sm" muted />
      </Figure>
    </tr>
  );
}

function Total({
  categories,
  currency,
}: {
  readonly categories: readonly CategoryTotal[];
  readonly currency: CurrencyCode;
}) {
  const total = categories.reduce((running, entry) => running + entry.minor, 0n);
  const payments = categories.reduce((running, entry) => running + entry.count, 0);

  return (
    <tfoot>
      <tr className="border-border-strong border-t-2 font-medium">
        <th scope="row" className={cn(CELL, 'text-left')}>
          Total money out
        </th>
        <td className={cn(CELL, NUMERIC)}>{payments}</td>
        <td className={cn(CELL, NUMERIC)}>100.0%</td>
        <td className={cn(CELL, NUMERIC)}>
          <MoneyText amount={total.toString()} currency={currency} size="sm" muted />
        </td>
      </tr>
    </tfoot>
  );
}

/** Props for {@link CategoryTable}. */
export interface CategoryTableProps {
  readonly categories: readonly CategoryTotal[];
  readonly currency: CurrencyCode;
  /** The window the figures cover, carried into each row's link. */
  readonly filters: TransactionFilters;
  /** The window in words, for the caption: "the last 30 days". */
  readonly periodLabel: string;
}

/**
 * @example <CategoryTable categories={totals.byCategory} currency="GBP" filters={filters} … />
 */
export function CategoryTable({ categories, currency, filters, periodLabel }: CategoryTableProps) {
  return (
    <DataTable
      caption={`Money out by category over ${periodLabel}, in ${currency}. Every figure is the sum of the payments behind it.`}
    >
      <TableHead headings={HEADINGS} />
      <tbody>
        {categories.map((entry) => (
          <Row key={entry.category} entry={entry} currency={currency} filters={filters} />
        ))}
      </tbody>
      <Total categories={categories} currency={currency} />
    </DataTable>
  );
}
