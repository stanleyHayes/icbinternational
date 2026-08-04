/**
 * The trial balance.
 *
 * Every general-ledger account with its debit and credit side, footed. This is the one
 * table in the bank whose totals must agree exactly, and the footer says so on every
 * render rather than only when they do not.
 *
 * Accounts are grouped by type — assets, liabilities, equity, income, expenses — because
 * that is the order a trial balance is read in, and because seeing the liability block
 * total is how an operator recognises the deposit book without being told which codes it
 * is made of.
 */

'use client';

import { LedgerAccountType, type TrialBalance } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { TableHead, sumMinor } from '@/components/ops';
import { humaniseCode } from '@/lib/format';

/** Line of a trial balance, as the contract shapes it. */
type Line = TrialBalance['lines'][number];

/** The order a trial balance is read in. */
const TYPE_ORDER: readonly LedgerAccountType[] = [
  LedgerAccountType.ASSET,
  LedgerAccountType.LIABILITY,
  LedgerAccountType.EQUITY,
  LedgerAccountType.INCOME,
  LedgerAccountType.EXPENSE,
];

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-3 py-2';
const NUMERIC = 'px-3 py-2 text-right tabular-nums';

function LineRow({ line }: Readonly<{ line: Line }>) {
  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        <span className="text-fg-subtle font-mono text-xs">{line.code}</span> {line.name}
      </th>
      <td className={NUMERIC}>
        <MoneyText
          amount={line.debit.amount}
          currency={line.debit.currency}
          display="none"
          size="sm"
          muted
        />
      </td>
      <td className={NUMERIC}>
        <MoneyText
          amount={line.credit.amount}
          currency={line.credit.currency}
          display="none"
          size="sm"
          muted
        />
      </td>
    </tr>
  );
}

function TypeGroup({ type, lines }: Readonly<{ type: LedgerAccountType; lines: readonly Line[] }>) {
  if (lines.length === 0) return null;
  const currency = lines[0]?.debit.currency ?? 'GBP';
  const debits = sumMinor(lines.map((line) => line.debit.amount));
  const credits = sumMinor(lines.map((line) => line.credit.amount));

  return (
    <tbody className="border-border-strong border-b last:border-0">
      <tr className="bg-surface-sunken">
        <th scope="colgroup" className={`${HEAD} tracking-wider uppercase`}>
          {humaniseCode(type)}
        </th>
        <td className={NUMERIC}>
          <MoneyText amount={debits} currency={currency} display="none" size="sm" muted />
        </td>
        <td className={NUMERIC}>
          <MoneyText amount={credits} currency={currency} display="none" size="sm" muted />
        </td>
      </tr>
      {lines.map((line) => (
        <LineRow key={line.code} line={line} />
      ))}
    </tbody>
  );
}

export interface TrialBalanceTableProps {
  readonly balance: TrialBalance;
}

/** Every ledger account, grouped by type and footed. */
/**
 * The two column sums.
 *
 * This is the whole point of a trial balance: if these two figures are not identical, the
 * book does not foot and every report derived from it is describing a bank that does not
 * add up.
 */
function TotalsRow({
  debits,
  credits,
}: {
  readonly debits: TrialBalanceTableProps['balance']['totalDebits'];
  readonly credits: TrialBalanceTableProps['balance']['totalCredits'];
}) {
  return (
    <tfoot>
      <tr className="border-border-strong border-t-2 font-semibold">
        <th scope="row" className={`${CELL} text-left`}>
          Totals
        </th>
        <td className={NUMERIC}>
          <MoneyText
            amount={debits.amount}
            currency={debits.currency}
            display="none"
            size="sm"
            muted
          />
        </td>
        <td className={NUMERIC}>
          <MoneyText
            amount={credits.amount}
            currency={credits.currency}
            display="none"
            size="sm"
            muted
          />
        </td>
      </tr>
    </tfoot>
  );
}

export function TrialBalanceTable({ balance }: TrialBalanceTableProps) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">
          Trial balance in {balance.currency}, every ledger account with its debit and credit side
        </caption>
        <TableHead
          className={HEAD}
          headings={[
            'Ledger account',
            { label: 'Debit', align: 'right' },
            { label: 'Credit', align: 'right' },
          ]}
        />

        {TYPE_ORDER.map((type) => (
          <TypeGroup
            key={type}
            type={type}
            lines={balance.lines.filter((line) => line.type === type)}
          />
        ))}

        <TotalsRow debits={balance.totalDebits} credits={balance.totalCredits} />
      </table>
    </div>
  );
}
