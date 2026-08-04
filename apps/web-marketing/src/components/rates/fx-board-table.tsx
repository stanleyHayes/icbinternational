import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import type { FxBoard } from '@reliance/contracts';
import { cn } from '@reliance/ui';

import { DataCell, DataRow, DataTable, RowHeader } from '@/components/marketing/data-table';
import { formatBps, formatDate } from '@/lib/format';

const ICON_SIZE = 14;

const COLUMNS = [
  { key: 'pair', label: 'Currency' },
  { key: 'rate', label: 'Our rate', numeric: true },
  { key: 'spread', label: 'Spread', numeric: true },
  { key: 'change', label: 'Change on the day', numeric: true },
] as const;

/**
 * A day's movement, shown with a direction word as well as a colour and an arrow.
 *
 * Colour alone would leave a colour-blind customer reading the two directions as the same
 * number — so the sign, the arrow and the word "stronger" or "weaker" all carry it.
 */
function Change({ changeBps }: { readonly changeBps: number }) {
  if (changeBps === 0) {
    return (
      <span className="text-fg-muted inline-flex items-center gap-1">
        <Minus size={ICON_SIZE} aria-hidden />
        Unchanged
      </span>
    );
  }

  const stronger = changeBps > 0;
  const Icon = stronger ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn('inline-flex items-center gap-1', stronger ? 'text-credit' : 'text-debit')}>
      <Icon size={ICON_SIZE} aria-hidden />
      {stronger ? '+' : '−'}
      {formatBps(Math.abs(changeBps))} {stronger ? 'stronger' : 'weaker'}
    </span>
  );
}

/** The published exchange-rate board. */
export function FxBoardTable({ board }: { readonly board: FxBoard }) {
  return (
    <DataTable
      caption={`Exchange rates against ${board.base}, with the spread and the day's movement`}
      columns={COLUMNS}
      footnote={
        <>
          Rates are indicative and move through the day. The rate applied to a conversion is the one
          quoted at the moment you confirm it, and it is shown before you do. Board as at{' '}
          {formatDate(board.asOf)}.
        </>
      }
    >
      {board.rates.map((rate) => (
        <DataRow key={`${rate.from}-${rate.to}`}>
          <RowHeader detail={`1 ${rate.from} buys`}>
            {rate.from}/{rate.to}
          </RowHeader>
          <DataCell numeric>
            <span className="rb-tabular text-fg font-medium tabular-nums">{rate.ask}</span>
          </DataCell>
          <DataCell numeric>{formatBps(rate.spreadBps)}</DataCell>
          <DataCell numeric>
            <Change changeBps={rate.changeBps} />
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
