/**
 * Building the offer.
 *
 * An underwriter rarely says yes or no to exactly what was asked for. The usual answer is
 * a counter-offer — less money, a longer term, a higher rate — and the applicant has to be
 * able to see what that costs them per month before they accept it. So the builder quotes
 * every change through the platform's own calculator rather than approximating it here:
 * a monthly payment worked out in the browser would be a different number from the one on
 * the credit agreement.
 */

'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { LoanApplication, LoanQuote } from '@reliance/contracts';
import { Alert, Button, CurrencyInput, FormField, Input, MoneyText } from '@reliance/ui';

import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatBasisPoints, formatDate } from '@/lib/format';

const ROW = 'flex items-baseline justify-between gap-3 py-1';
const LABEL = 'font-body text-sm text-fg-muted';

/** Longest term the platform will quote, in months. */
const MAX_TERM_MONTHS = 480;

export interface QuotedOffer {
  readonly amount: LoanQuote['amount'];
  readonly termMonths: number;
  readonly aprBps: number;
}

/** One labelled money figure. The monthly payment is the one a customer hears, so it is not muted. */
function MoneyRow({
  label,
  money,
  emphasis = false,
}: {
  readonly label: string;
  readonly money: LoanQuote['monthlyPayment'];
  readonly emphasis?: boolean;
}) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <MoneyText amount={money.amount} currency={money.currency} size="sm" muted={!emphasis} />
    </div>
  );
}

/** One labelled fact that is not a money amount. */
function FactRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className="font-body text-fg text-sm">{value}</span>
    </div>
  );
}

function QuoteSummary({ quote }: Readonly<{ quote: LoanQuote }>) {
  return (
    <div className="border-border flex flex-col rounded-md border p-3">
      <MoneyRow label="Monthly payment" money={quote.monthlyPayment} emphasis />
      <MoneyRow label="Total repayable" money={quote.totalRepayable} />
      <MoneyRow label="Total interest" money={quote.totalInterest} />
      <MoneyRow label="Arrangement fee" money={quote.arrangementFee} />
      <FactRow label="Rate" value={`${formatBasisPoints(quote.aprBps)} APR`} />
      <FactRow label="First payment due" value={formatDate(quote.firstPaymentDate)} />
    </div>
  );
}

export interface OfferBuilderProps {
  readonly application: LoanApplication;
  /** Called whenever a quote is produced, so the decision form can offer it. */
  readonly onQuoted: (offer: QuotedOffer) => void;
}

/** The two things an underwriter can move: how much, and for how long. */
function OfferFields({
  currency,
  amount,
  term,
  onAmount,
  onTerm,
}: {
  readonly currency: LoanQuote['monthlyPayment']['currency'];
  readonly amount: string;
  readonly term: string;
  readonly onAmount: (next: string) => void;
  readonly onTerm: (next: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Amount to offer" hint="Lower than the request makes this a counter-offer.">
        <CurrencyInput currency={currency} value={amount} onValueChange={onAmount} />
      </FormField>
      <FormField label="Term in months" hint="A longer term lowers the payment and costs more.">
        <Input value={term} inputMode="numeric" onChange={(event) => onTerm(event.target.value)} />
      </FormField>
    </div>
  );
}

/** Quotes a counter-offer through the platform's calculator. */
/**
 * The counter-offer being built, and the calculator that prices it.
 *
 * The term is held as text so a half-typed number is not coerced mid-edit; `valid` is what
 * decides whether it can be sent, and it insists on a whole number of months within the
 * product's maximum rather than merely something numeric.
 */
function useOffer(application: LoanApplication, onQuoted: OfferBuilderProps['onQuoted']) {
  const client = useApiClient();
  const [amount, setAmount] = useState(application.requestedAmount.amount);
  const [term, setTerm] = useState(String(application.termMonths));

  const quote = useMutation({
    mutationFn: async () =>
      (
        await client.borrow.calculate({
          productCode: application.productCode,
          amount: { amount, currency: application.requestedAmount.currency },
          termMonths: Number(term),
        })
      ).data,
    onSuccess: (result) =>
      onQuoted({ amount: result.amount, termMonths: result.termMonths, aprBps: result.aprBps }),
  });

  const termMonths = Number(term);

  return {
    amount,
    setAmount,
    term,
    setTerm,
    quote,
    valid: Number.isInteger(termMonths) && termMonths > 0 && termMonths <= MAX_TERM_MONTHS,
  };
}

export function OfferBuilder({ application, onQuoted }: OfferBuilderProps) {
  const { amount, setAmount, term, setTerm, quote, valid } = useOffer(application, onQuoted);

  return (
    <div className="flex flex-col gap-3">
      {quote.error && <Alert tone="danger">{messageFor(quote.error)}</Alert>}

      <OfferFields
        currency={application.requestedAmount.currency}
        amount={amount}
        term={term}
        onAmount={setAmount}
        onTerm={setTerm}
      />

      <div>
        <Button
          variant="secondary"
          loading={quote.isPending}
          disabled={!valid}
          onClick={() => quote.mutate()}
        >
          Quote this offer
        </Button>
      </div>

      {quote.data && <QuoteSummary quote={quote.data} />}
    </div>
  );
}
