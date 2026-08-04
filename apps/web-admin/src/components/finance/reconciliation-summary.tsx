/**
 * The four figures that decide whether a reconciliation is finished.
 *
 * Our ledger, their statement, the gap between them, and how much matched. The gap is the
 * only one that matters and it is coloured accordingly — but it is also spelled out in
 * words underneath, because a red number on its own tells a colour-blind operator nothing.
 */

'use client';

import type { ReconciliationReport } from '@reliance/api-client';
import type { Money } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { KpiTile } from '@/components/ops';
import { formatCount, formatDate } from '@/lib/format';

export interface ReconciliationSummaryProps {
  readonly report: ReconciliationReport;
}

/** Headline figures for one reconciliation run. */
export function ReconciliationSummary({ report }: ReconciliationSummaryProps) {
  const window = `${formatDate(report.periodStart)} to ${formatDate(report.periodEnd)}`;
  const figure = (amount: Money) => (
    <MoneyText amount={amount.amount} currency={amount.currency} size="xl" muted />
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Our ledger"
        value={figure(report.internalTotal)}
        hint={`${report.rail} · ${window}`}
      />
      <KpiTile
        label="Rail statement"
        value={figure(report.externalTotal)}
        hint="As presented by the counterparty for the same window."
      />
      <KpiTile
        label="Difference"
        tone={report.reconciled ? 'success' : 'danger'}
        value={figure(report.difference)}
        hint={report.reconciled ? 'The two sides agree.' : 'Investigate before the cut-off.'}
      />
      <KpiTile
        label="Matched items"
        value={formatCount(report.matchedCount)}
        hint={`${formatCount(report.unmatched.length)} still unmatched.`}
      />
    </div>
  );
}
