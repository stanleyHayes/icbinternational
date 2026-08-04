import type { FeeScheduleEntry } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';

const COLUMNS = [
  { key: 'fee', label: 'What it is for' },
  { key: 'charge', label: 'Charge', numeric: true },
  { key: 'allowance', label: 'Free each month', numeric: true },
] as const;

/** How many of a fee are free each month, in words rather than a bare zero. */
function allowanceLabel(entry: FeeScheduleEntry): string {
  if (BigInt(entry.flatAmount?.amount ?? '0') === 0n) return 'Always free';
  if (entry.freeAllowancePerMonth === 0) return 'None';
  return entry.freeAllowancePerMonth === 1
    ? 'First one'
    : `First ${String(entry.freeAllowancePerMonth)}`;
}

/**
 * The published fee schedule.
 *
 * A zero fee is rendered as the words "No charge" rather than "£0.00": the point of this
 * table is that most lines are free, and a column of zeroes buries that.
 */
export function FeeTable({ fees }: { readonly fees: readonly FeeScheduleEntry[] }) {
  return (
    <DataTable
      caption="Every charge on a Reliance Bank account, what triggers it and how many are free each month"
      columns={COLUMNS}
      footnote="This is the complete list. Anything not on it is not charged for."
    >
      {fees.map((entry) => {
        const charge = entry.flatAmount;
        const free = charge === null || BigInt(charge.amount) === 0n;

        return (
          <DataRow key={entry.kind}>
            <RowHeader
              detail={
                entry.waivedForTiers.length > 0
                  ? `Waived on ${entry.waivedForTiers.join(' and ')} accounts`
                  : undefined
              }
            >
              {entry.label}
            </RowHeader>
            <DataCell numeric>
              {free ? (
                <span className="text-accent font-medium">No charge</span>
              ) : (
                <MoneyText
                  amount={charge.amount}
                  currency={charge.currency}
                  muted
                  srLabel="Charge"
                />
              )}
            </DataCell>
            <DataCell numeric>{allowanceLabel(entry)}</DataCell>
          </DataRow>
        );
      })}
    </DataTable>
  );
}
