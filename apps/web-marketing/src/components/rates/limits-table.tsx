import type { LimitMatrix, Product } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';

const COLUMNS = [
  { key: 'scope', label: 'What' },
  { key: 'perTransaction', label: 'Per payment', numeric: true },
  { key: 'daily', label: 'Per day', numeric: true },
] as const;

/** The rows, in the order a customer meets them. */
const SCOPES = [
  { key: 'internalTransfer', label: 'Between your own accounts' },
  { key: 'domesticTransfer', label: 'To another UK account' },
  { key: 'internationalTransfer', label: 'International transfer' },
  { key: 'cardSpend', label: 'Card spending' },
  { key: 'atmWithdrawal', label: 'Cash machine withdrawals' },
] as const satisfies readonly { key: keyof Product['limits']; label: string }[];

/** `null` means no cap, which is a real answer and reads better than a blank cell. */
function LimitCell({ amount }: { readonly amount: LimitMatrix['daily'] }) {
  if (amount === null) return <DataCell numeric>No limit</DataCell>;

  return (
    <DataCell numeric>
      <MoneyText amount={amount.amount} currency={amount.currency} muted />
    </DataCell>
  );
}

/** The payment limits that apply to a product. */
export function LimitsTable({ product }: { readonly product: Product }) {
  return (
    <DataTable
      caption={`Payment and withdrawal limits on the ${product.name}`}
      columns={COLUMNS}
      footnote="Limits can be lowered at any time in the app, and raised after we have verified your identity to the next tier."
    >
      {SCOPES.map((scope) => {
        const matrix = product.limits[scope.key];
        return (
          <DataRow key={scope.key}>
            <RowHeader>{scope.label}</RowHeader>
            <LimitCell amount={matrix.perTransaction} />
            <LimitCell amount={matrix.daily} />
          </DataRow>
        );
      })}
    </DataTable>
  );
}
