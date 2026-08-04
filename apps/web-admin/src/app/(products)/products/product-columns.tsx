/**
 * The catalogue's columns.
 *
 * Version and effective dates are first-class here rather than hidden in a detail panel,
 * because the catalogue holds every version a product has ever had. An operator answering
 * "what was this account sold on" needs to see the superseded rows and the dates that
 * separate them.
 */

'use client';

import type { Product } from '@reliance/contracts';
import { Badge, Button, MoneyText } from '@reliance/ui';

import type { DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatDate, humaniseCode } from '@/lib/format';

/** Headline credit rate: the top tier a customer could reach on this product. */
function headlineRate(product: Product): number {
  return product.creditInterestTiers.reduce((best, tier) => Math.max(best, tier.annualRateBps), 0);
}

/** What the product is, and which version this row is. */
const IDENTITY_COLUMNS: readonly DataColumn<Product>[] = [
  {
    id: 'name',
    header: 'Product',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.name}</span>
        <span className="text-fg-muted font-mono text-xs">{row.code}</span>
      </span>
    ),
    csv: (row) => `${row.name} (${row.code})`,
    sortValue: (row) => row.name,
  },
  {
    id: 'version',
    header: 'Version',
    align: 'end',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex items-center justify-end gap-2">
        v{row.version}
        {row.effectiveTo === null ? (
          <Badge tone="success">Current</Badge>
        ) : (
          <Badge tone="neutral">Superseded</Badge>
        )}
      </span>
    ),
    csv: (row) => String(row.version),
    sortValue: (row) => row.version,
  },
  {
    id: 'accountType',
    header: 'Account type',
    cell: (row) => humaniseCode(row.accountType),
    csv: (row) => row.accountType,
  },
];

/** What it costs and what it pays. */
const PRICING_COLUMNS: readonly DataColumn<Product>[] = [
  {
    id: 'monthlyFee',
    header: 'Monthly fee',
    align: 'end',
    cell: (row) => (
      <MoneyText
        amount={row.monthlyFee.amount}
        currency={row.monthlyFee.currency}
        size="sm"
        muted
      />
    ),
    csv: (row) => row.monthlyFee.amount,
    sortValue: (row) => BigInt(row.monthlyFee.amount),
  },
  {
    id: 'rate',
    header: 'Top credit rate',
    align: 'end',
    cell: (row) => formatBasisPoints(headlineRate(row)),
    csv: (row) => String(headlineRate(row)),
    sortValue: (row) => headlineRate(row),
  },
  {
    id: 'currencies',
    header: 'Currencies',
    cell: (row) => row.currencies.join(', '),
    csv: (row) => row.currencies.join(' '),
  },
  {
    id: 'active',
    header: 'Open to new customers',
    cell: (row) => (row.active ? 'Yes' : 'No'),
    csv: (row) => (row.active ? 'yes' : 'no'),
  },
  {
    id: 'effectiveFrom',
    header: 'Effective from',
    cell: (row) => formatDate(row.effectiveFrom),
    csv: (row) => row.effectiveFrom,
    sortValue: (row) => row.effectiveFrom,
  },
  {
    id: 'effectiveTo',
    header: 'Superseded',
    cell: (row) => (row.effectiveTo ? formatDate(row.effectiveTo) : '—'),
    csv: (row) => row.effectiveTo ?? '',
  },
];

/** The catalogue's columns, bound to the editor. */
export function productColumns(onOpen: (product: Product) => void): readonly DataColumn<Product>[] {
  return [
    ...IDENTITY_COLUMNS,
    ...PRICING_COLUMNS,
    {
      id: 'open',
      header: 'Edit',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.code,
    },
  ];
}
