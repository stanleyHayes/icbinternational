/**
 * The renderer every financial report shares.
 *
 * A profit and loss, a balance sheet and a general ledger differ in which lines they
 * contain, not in how a line is drawn — so there is one renderer rather than three that
 * drift apart. Indentation comes from the line's own depth, which means the console never
 * has to know the chart of accounts to lay a report out correctly.
 */

'use client';

import type { ReportLine } from '@reliance/api-client';
import { cn, MoneyText } from '@reliance/ui';

/** Indentation applied per level of nesting. Index is the line's declared depth. */
const INDENT = ['pl-3', 'pl-7', 'pl-11', 'pl-15', 'pl-19', 'pl-23'] as const;

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const NUMERIC = 'px-3 py-2 text-right tabular-nums';

function Line({ line, comparative }: Readonly<{ line: ReportLine; comparative: boolean }>) {
  return (
    <tr className={cn('border-border border-b last:border-0', line.isSubtotal && 'font-semibold')}>
      <th
        scope="row"
        className={cn('py-2 pr-3 text-left font-normal', INDENT[line.depth] ?? INDENT[0])}
      >
        <span className="text-fg-subtle font-mono text-xs">{line.code}</span> {line.label}
      </th>
      <td className={NUMERIC}>
        <MoneyText amount={line.amount.amount} currency={line.amount.currency} size="sm" muted />
      </td>
      {comparative && (
        <td className={NUMERIC}>
          {line.comparativeAmount ? (
            <MoneyText
              amount={line.comparativeAmount.amount}
              currency={line.comparativeAmount.currency}
              size="sm"
              muted
            />
          ) : (
            '—'
          )}
        </td>
      )}
    </tr>
  );
}

export interface ReportTableProps {
  /** Describes the report for a screen reader. */
  readonly caption: string;
  readonly lines: readonly ReportLine[];
  /** Heading over the figures column, e.g. "This period". */
  readonly amountHeader: string;
  /** Shows the prior-period column. */
  readonly comparative?: boolean;
}

/** A financial report, indented by the chart of accounts' own nesting. */
export function ReportTable({ caption, lines, amountHeader, comparative }: ReportTableProps) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border bg-surface-sunken border-b">
            <th scope="col" className={HEAD}>
              Ledger account
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              {amountHeader}
            </th>
            {comparative && (
              <th scope="col" className={`${HEAD} text-right`}>
                Prior period
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Line
              key={`${line.code}:${line.label}`}
              line={line}
              comparative={Boolean(comparative)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
