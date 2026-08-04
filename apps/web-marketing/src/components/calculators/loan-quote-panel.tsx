'use client';

import type { LoanQuote } from '@reliance/contracts';

import { LinkButton } from '@/components/marketing/link-button';
import { formatBps, formatDate, formatTerm } from '@/lib/format';

import { QuoteFact, QuoteFigure } from './quote-figure';

/**
 * The loan result panel.
 *
 * `aria-live="polite"` sits on the whole panel rather than each figure: six figures
 * announced separately would talk over one another, and the customer asked for all six at
 * once.
 */
export function LoanQuotePanel({
  quote,
  message,
}: {
  readonly quote: LoanQuote | null;
  readonly message: string;
}) {
  return (
    <div aria-live="polite" className="border-border bg-surface-sunken rounded-xl border p-6">
      {message ? <p className="text-danger text-sm">{message}</p> : null}

      {quote ? <Quote quote={quote} /> : <Prompt />}
    </div>
  );
}

function Prompt() {
  return (
    <p className="text-fg-muted text-sm leading-relaxed">
      Enter an amount and a term, and we will show the monthly payment, the interest and the total
      amount repayable.
    </p>
  );
}

function Quote({ quote }: { readonly quote: LoanQuote }) {
  return (
    <>
      <p className="text-fg text-sm font-medium">Your quote</p>
      <dl className="mt-4 grid grid-cols-2 gap-5">
        <QuoteFigure label="Monthly payment" amount={quote.monthlyPayment} emphasis />
        <QuoteFigure label="Total repayable" amount={quote.totalRepayable} emphasis />
        <QuoteFigure label="Interest" amount={quote.totalInterest} />
        <QuoteFigure label="Arrangement fee" amount={quote.arrangementFee} />
        <QuoteFact label="Representative APR" value={formatBps(quote.aprBps)} />
        <QuoteFact label="First payment" value={formatDate(quote.firstPaymentDate)} />
      </dl>
      <p className="text-fg-subtle mt-6 text-xs leading-relaxed">
        Based on {formatTerm(quote.termMonths)} at {formatBps(quote.aprBps)} representative APR.
        Your own rate depends on your circumstances and is confirmed before you accept anything.
      </p>
      <div className="mt-5">
        <LinkButton href="/open-an-account" variant="secondary" fullWidth>
          Apply for this loan
        </LinkButton>
      </div>
    </>
  );
}
