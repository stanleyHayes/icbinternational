import type { PublicRates } from '@reliance/api-client';
import { MoneyText } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { formatAer, formatDate } from '@/lib/format';

const COLUMNS = [
  { key: 'product', label: 'Account' },
  { key: 'rate', label: 'Interest rate', numeric: true },
  { key: 'minimum', label: 'Minimum balance', numeric: true },
] as const;

/** The savings side of the published rate board. */
export function SavingsRateTable({ rates }: { readonly rates: PublicRates }) {
  return (
    <DataTable
      caption="Savings interest rates by account, with the minimum balance each requires"
      columns={COLUMNS}
      footnote={
        <>
          Rates are variable and paid monthly. Effective from {formatDate(rates.effectiveFrom)}. AER
          stands for Annual Equivalent Rate and shows what the interest would be if it were paid and
          compounded once a year.
        </>
      }
    >
      {rates.savings.map((entry) => (
        <DataRow key={entry.productCode}>
          <RowHeader detail={entry.productCode}>{entry.productName}</RowHeader>
          <DataCell numeric>
            <span className="text-fg font-medium">{formatAer(entry.annualRateBps)}</span>
          </DataCell>
          <DataCell numeric>
            <MoneyText
              amount={entry.minBalance.amount}
              currency={entry.minBalance.currency}
              muted
              srLabel="Minimum balance"
            />
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
