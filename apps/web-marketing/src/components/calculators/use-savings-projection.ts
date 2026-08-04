'use client';

import { useState, useTransition, type FormEvent } from 'react';

import type { SavingsProjection } from '@reliance/api-client';

import { calculateSavingsAction } from '@/lib/actions/calculator-actions';
import { IDLE_FORM_STATE, type FormState } from '@/lib/actions/form-state';

const DEFAULT_INITIAL = '2,000';
const DEFAULT_MONTHLY = '200';
const DEFAULT_TERM = '60';

/** The savings calculator's inputs, its answer, and the one action that connects them. */
export interface SavingsForm {
  readonly initialDeposit: string;
  readonly setInitialDeposit: (value: string) => void;
  readonly monthlyContribution: string;
  readonly setMonthlyContribution: (value: string) => void;
  readonly months: string;
  readonly setMonths: (value: string) => void;
  readonly projection: SavingsProjection | null;
  readonly error: FormState;
  readonly pending: boolean;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * State for the savings calculator.
 *
 * The projection is computed by the bank, in integer minor units, and only ever read here.
 * A failed call clears the previous answer rather than leaving it on screen beside an
 * error, which would leave the customer looking at figures for inputs they have changed.
 */
export function useSavingsProjection(annualRateBps: number): SavingsForm {
  const [initialDeposit, setInitialDeposit] = useState(DEFAULT_INITIAL);
  const [monthlyContribution, setMonthlyContribution] = useState(DEFAULT_MONTHLY);
  const [months, setMonths] = useState(DEFAULT_TERM);
  const [projection, setProjection] = useState<SavingsProjection | null>(null);
  const [error, setError] = useState<FormState>(IDLE_FORM_STATE);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await calculateSavingsAction({
        initialDeposit,
        monthlyContribution,
        annualRateBps,
        months: Number(months),
      });
      setProjection(result.ok ? result.quote : null);
      setError(result.ok ? IDLE_FORM_STATE : result.error);
    });
  };

  return {
    initialDeposit,
    setInitialDeposit,
    monthlyContribution,
    setMonthlyContribution,
    months,
    setMonths,
    projection,
    error,
    pending,
    submit,
  };
}
