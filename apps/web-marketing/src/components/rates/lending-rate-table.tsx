import type { PublicRates } from '@reliance/api-client';
import { MoneyText } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { formatBps } from '@/lib/format';

const COLUMNS = [
  { key: 'product', label: 'Product' },
  { key: 'apr', label: 'Representative APR', numeric: true },
  { key: 'max', label: 'Maximum amount', numeric: true },
] as const;

/** The lending side of the published rate board. */
export function LendingRateTable({ rates }: { readonly rates: PublicRates }) {
  return (
    <DataTable
      caption="Representative APR and maximum amount for each lending product"
      columns={COLUMNS}
      footnote={
        <>
          Representative APR means at least 51% of accepted applicants are offered that rate or
          better. Your own rate depends on your circumstances and is quoted in full, with the total
          amount repayable, before you commit to anything.
        </>
      }
    >
      {rates.lending.map((entry) => (
        <DataRow key={entry.productCode}>
          <RowHeader detail={entry.productCode}>{entry.productName}</RowHeader>
          <DataCell numeric>
            <span className="text-fg font-medium">{formatBps(entry.representativeAprBps)}</span>
          </DataCell>
          <DataCell numeric>
            <MoneyText
              amount={entry.maxAmount.amount}
              currency={entry.maxAmount.currency}
              muted
              srLabel="Maximum amount"
            />
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
