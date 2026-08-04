'use client';

import { useState, useTransition, type FormEvent } from 'react';

import type { LoanQuote } from '@reliance/contracts';

import { calculateLoanAction } from '@/lib/actions/calculator-actions';
import { IDLE_FORM_STATE, type FormState } from '@/lib/actions/form-state';

import { CalculatorShell } from './calculator-shell';
import { LoanInputs, type LoanChoice } from './loan-inputs';
import { LoanQuotePanel } from './loan-quote-panel';

const DEFAULT_AMOUNT = '12,500';
const DEFAULT_TERM = '36';

export interface LoanCalculatorProps {
  /** Products from the lending catalogue, with their display names. */
  readonly products: readonly LoanChoice[];
}

/**
 * The loan repayment calculator.
 *
 * Every figure comes back from the bank's own quoting endpoint. Nothing is computed in the
 * browser, because a browser computes in floating point and the schedule the customer
 * would eventually be given is computed in integer minor units — two answers that agree to
 * within a penny are still two answers.
 */
export function LoanCalculator({ products }: LoanCalculatorProps) {
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [termMonths, setTermMonths] = useState(DEFAULT_TERM);
  const [productCode, setProductCode] = useState(products[0]?.code ?? '');
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [error, setError] = useState<FormState>(IDLE_FORM_STATE);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const term = Number(termMonths);
      const result = await calculateLoanAction({ productCode, amount, termMonths: term });
      setQuote(result.ok ? result.quote : null);
      setError(result.ok ? IDLE_FORM_STATE : result.error);
    });
  };

  return (
    <CalculatorShell
      title="What would it cost?"
      intro="No credit search is run and nothing is recorded against your file."
      legend="Loan details"
      submitLabel="Calculate repayments"
      pending={pending}
      onSubmit={submit}
      result={<LoanQuotePanel quote={quote} message={error.message} />}
    >
      <LoanInputs
        amount={amount}
        onAmountChange={setAmount}
        termMonths={termMonths}
        onTermChange={setTermMonths}
        productCode={productCode}
        onProductChange={setProductCode}
        products={products}
        errors={error.fieldErrors}
      />
    </CalculatorShell>
  );
}
