import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { formatBps, formatDate } from '@/lib/format';
import type { OverdraftRateRow } from '@/lib/rates';

const COLUMNS = [
  { key: 'product', label: 'Account' },
  { key: 'ear', label: 'Arranged overdraft EAR', numeric: true },
] as const;

/**
 * The borrowing side of the published rate board.
 *
 * This table used to be headed "Representative APR" and to list a maximum loan amount,
 * against a `lending` array the API has never returned. What `/public/rates` actually
 * publishes is `debitInterestBps` — the arranged-overdraft rate on a current account,
 * which is an EAR, not an APR, and carries no lending limit. Quoting an overdraft rate
 * under an APR heading would misstate a borrowing cost on a bank's own rate board, so the
 * table now says what the figure is.
 *
 * Personal-loan APRs are not on the public surface at all: they live behind
 * `/loans/products`, which the marketing client is forbidden from calling. Until a public
 * loan-products endpoint exists, the loans page cannot publish a rate board.
 */
export function LendingRateTable({
  rows,
  effectiveFrom,
}: {
  readonly rows: readonly OverdraftRateRow[];
  readonly effectiveFrom: string;
}) {
  return (
    <DataTable
      caption="Arranged overdraft rates by account"
      columns={COLUMNS}
      footnote={
        <>
          Effective from {formatDate(effectiveFrom)}. EAR stands for Equivalent Annual Rate and
          shows what an arranged overdraft costs over a year if you stayed in it, with interest
          charged on interest. Your own limit depends on your circumstances and is quoted before you
          agree to it.
        </>
      }
    >
      {rows.map((row) => (
        <DataRow key={row.code}>
          <RowHeader detail={row.code}>{row.name}</RowHeader>
          <DataCell numeric>
            <span className="text-fg font-medium">{formatBps(row.annualRateBps)}</span>
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
