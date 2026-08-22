import { MoneyText } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { formatAer, formatDate } from '@/lib/format';
import type { SavingsRateRow } from '@/lib/rates';

const COLUMNS = [
  { key: 'product', label: 'Account' },
  { key: 'rate', label: 'Interest rate', numeric: true },
  { key: 'minimum', label: 'Balance from', numeric: true },
] as const;

/**
 * The savings side of the published rate board.
 *
 * Takes rows rather than the raw response: a product pays in bands, and deciding which
 * band to quote is a judgement about what the bank is claiming, not a rendering detail.
 * `savingsRows` makes it once — see the note there on why it is the top band.
 */
export function SavingsRateTable({
  rows,
  effectiveFrom,
}: {
  readonly rows: readonly SavingsRateRow[];
  readonly effectiveFrom: string;
}) {
  return (
    <DataTable
      caption="Savings interest rates by account, with the balance each rate starts at"
      columns={COLUMNS}
      footnote={
        <>
          Rates are variable and paid monthly. Effective from {formatDate(effectiveFrom)}. AER
          stands for Annual Equivalent Rate and shows what the interest would be if it were paid and
          compounded once a year.
        </>
      }
    >
      {rows.map((row) => (
        <DataRow key={row.code}>
          <RowHeader detail={row.code}>{row.name}</RowHeader>
          <DataCell numeric>
            <span className="text-fg font-medium">{formatAer(row.annualRateBps)}</span>
          </DataCell>
          <DataCell numeric>
            <MoneyText
              amount={row.minBalance.amount}
              currency={row.minBalance.currency}
              muted
              srLabel="Balance from"
            />
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
