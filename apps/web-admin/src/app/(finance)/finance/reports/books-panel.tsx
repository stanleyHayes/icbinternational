/**
 * The deposit book, the loan book, and where the bank's income comes from.
 *
 * All four figures are derived from the trial balance rather than from separate
 * endpoints, and that is the point: a deposit book that disagreed with the liability side
 * of the ledger would be a reporting error nobody would find for a month. Reading them off
 * the same source makes that impossible by construction.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { LedgerAccountType, type TrialBalance } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { KpiTile, Panel, QueryState, opsKeys, sumMinor } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';

type Line = TrialBalance['lines'][number];

/** The reporting currency. */
const CURRENCY = 'GBP';

/** Ledger codes carrying customer deposits. */
const DEPOSIT_CODES = /^2[01]\d\d$/;

/** Ledger codes carrying lending advanced to customers. */
const LOAN_CODES = /^13\d\d$/;

/** Ledger codes carrying fee income. */
const FEE_CODES = /^40\d\d$/;

/** Ledger codes carrying foreign-exchange income. */
const FX_CODES = /^41\d\d$/;

function totalWhere(lines: readonly Line[], pattern: RegExp, side: 'debit' | 'credit'): string {
  return sumMinor(lines.filter((line) => pattern.test(line.code)).map((line) => line[side].amount));
}

/** Falls back to the whole side of the book when no code matches the pattern. */
function totalByType(lines: readonly Line[], type: LedgerAccountType, side: 'debit' | 'credit') {
  return sumMinor(lines.filter((line) => line.type === type).map((line) => line[side].amount));
}

interface BookFigures {
  readonly deposits: string;
  readonly loans: string;
  readonly fees: string;
  readonly fx: string;
}

function figuresFrom(balance: TrialBalance): BookFigures {
  const { lines } = balance;
  const deposits = totalWhere(lines, DEPOSIT_CODES, 'credit');
  const loans = totalWhere(lines, LOAN_CODES, 'debit');

  return {
    deposits:
      deposits === '0' ? totalByType(lines, LedgerAccountType.LIABILITY, 'credit') : deposits,
    loans: loans === '0' ? totalByType(lines, LedgerAccountType.ASSET, 'debit') : loans,
    fees: totalWhere(lines, FEE_CODES, 'credit'),
    fx: totalWhere(lines, FX_CODES, 'credit'),
  };
}

function Figures({ figures }: Readonly<{ figures: BookFigures }>) {
  const money = (amount: string) => (
    <MoneyText amount={amount} currency={CURRENCY} size="xl" muted />
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Deposit book"
        tone="credit"
        value={money(figures.deposits)}
        hint="What customers hold with the bank. A liability, and the bank's cheapest funding."
      />
      <KpiTile
        label="Loan book"
        value={money(figures.loans)}
        hint="Principal advanced and not yet repaid. An asset."
      />
      <KpiTile
        label="Fee income"
        value={money(figures.fees)}
        hint="Account fees, card fees and payment charges recognised on the book."
      />
      <KpiTile
        label="Foreign-exchange income"
        value={money(figures.fx)}
        hint="The spread earned on conversions, shown to customers as an amount rather than a rate."
      />
    </div>
  );
}

/** Deposit and loan books, and where income is coming from. */
export function BooksPanel() {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.trialBalance(CURRENCY),
    queryFn: async ({ signal }) =>
      (await client.admin.trialBalance({ currency: CURRENCY }, { signal })).data,
  });

  return (
    <Panel
      title="Books and income"
      description="Read from the same trial balance as every other figure, so they cannot disagree with it."
    >
      <QueryState query={query} subject="the deposit and loan books">
        {query.data && <Figures figures={figuresFrom(query.data)} />}
      </QueryState>
    </Panel>
  );
}
