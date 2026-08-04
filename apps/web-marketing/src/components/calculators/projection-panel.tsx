'use client';

import type { SavingsProjection } from '@reliance/api-client';
import { MoneyText } from '@reliance/ui';

import { formatTerm } from '@/lib/format';

import { QuoteFigure } from './quote-figure';

/** The savings result panel. Announced as a whole, because it is read as a whole. */
export function ProjectionPanel({
  projection,
  message,
}: {
  readonly projection: SavingsProjection | null;
  readonly message: string;
}) {
  return (
    <div aria-live="polite" className="border-border bg-surface-sunken rounded-xl border p-6">
      {message ? <p className="text-danger text-sm">{message}</p> : null}

      {projection ? (
        <Projection projection={projection} />
      ) : (
        <p className="text-fg-muted text-sm leading-relaxed">
          Tell us what you are starting with and what you can add each month, and we will show the
          balance year by year.
        </p>
      )}
    </div>
  );
}

function Projection({ projection }: { readonly projection: SavingsProjection }) {
  return (
    <>
      <p className="text-fg text-sm font-medium">Your projection</p>
      <dl className="mt-4 grid grid-cols-2 gap-5">
        <QuoteFigure label="Balance at the end" amount={projection.finalBalance} emphasis />
        <QuoteFigure label="Interest earned" amount={projection.totalInterest} emphasis />
        <QuoteFigure label="You will have paid in" amount={projection.totalContributions} />
      </dl>

      <h4 className="text-fg mt-6 text-sm font-medium">Along the way</h4>
      <ul className="mt-3 space-y-2">
        {projection.milestones.map((milestone) => (
          <li key={milestone.month} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-fg-muted">{formatTerm(milestone.month)}</span>
            <MoneyText
              amount={milestone.balance.amount}
              currency={milestone.balance.currency}
              size="sm"
              muted
            />
          </li>
        ))}
      </ul>
    </>
  );
}
