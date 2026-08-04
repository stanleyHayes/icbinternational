/**
 * The fee schedule.
 *
 * A fee is a flat amount, a rate, or both with a floor and a cap, and the free allowance
 * is part of the price rather than a footnote to it — a card that charges £1.50 for cash
 * withdrawals after three free ones a month is a different product from one that charges
 * £1.50 from the first. Both numbers are therefore on the same row.
 */

'use client';

import type { FeeScheduleEntry } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { CurrencyInput, Input } from '@reliance/ui';

import { TableHead } from '@/components/ops';
import { formatBasisPoints } from '@/lib/format';

const CELL = 'px-2 py-2 align-middle';
const HEAD = 'px-2 py-2 text-left font-medium text-fg-muted';

export interface FeeScheduleEditorProps {
  readonly fees: readonly FeeScheduleEntry[];
  readonly currency: CurrencyCode;
  readonly onChange: (fees: readonly FeeScheduleEntry[]) => void;
}

interface RowProps {
  readonly fee: FeeScheduleEntry;
  readonly currency: CurrencyCode;
  readonly onPatch: (patch: Partial<FeeScheduleEntry>) => void;
}

function FeeRow({ fee, currency, onPatch }: RowProps) {
  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        {fee.label}
      </th>
      <td className={CELL}>
        <CurrencyInput
          currency={currency}
          value={fee.flatAmount?.amount ?? '0'}
          aria-label={`Flat fee for ${fee.label}`}
          onValueChange={(amount) => onPatch({ flatAmount: { amount, currency } })}
        />
      </td>
      <td className={CELL}>
        <Input
          inputSize="sm"
          inputMode="numeric"
          aria-label={`Rate for ${fee.label} in basis points`}
          value={String(fee.rateBps ?? 0)}
          suffix={<span className="text-fg-muted text-xs">bps</span>}
          onChange={(event) => onPatch({ rateBps: Number(event.target.value) || 0 })}
        />
      </td>
      <td className={CELL}>
        <Input
          inputSize="sm"
          inputMode="numeric"
          aria-label={`Free uses per month for ${fee.label}`}
          value={String(fee.freeAllowancePerMonth)}
          onChange={(event) => onPatch({ freeAllowancePerMonth: Number(event.target.value) || 0 })}
        />
      </td>
      <td className={`${CELL} text-fg-muted text-right`}>
        {fee.rateBps ? formatBasisPoints(fee.rateBps) : 'Flat only'}
      </td>
    </tr>
  );
}

/** Every fee on the product, and what it costs. */
export function FeeScheduleEditor({ fees, currency, onChange }: FeeScheduleEditorProps) {
  const patch = (index: number, change: Partial<FeeScheduleEntry>): void => {
    onChange(fees.map((fee, position) => (position === index ? { ...fee, ...change } : fee)));
  };

  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">Fee schedule for this product version</caption>
        <TableHead
          className={HEAD}
          headings={[
            'Fee',
            'Flat amount',
            'Rate',
            'Free each month',
            { label: 'Reads as', align: 'right' },
          ]}
        />
        <tbody>
          {fees.map((fee, index) => (
            <FeeRow
              key={fee.kind}
              fee={fee}
              currency={currency}
              onPatch={(change) => patch(index, change)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
