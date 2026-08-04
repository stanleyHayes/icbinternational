'use client';

import { FormField, Input, Select } from '@reliance/ui';

import type { FieldErrors } from '@/lib/actions/form-state';
import { formatTerm } from '@/lib/format';

const MONTHS_PER_YEAR = 12;

/** One to five years in single steps, then a ten-year horizon. */
const MAX_SHORT_TERM_YEARS = 5;
const LONG_TERM_YEARS = 10;

const TERM_OPTIONS = [
  ...Array.from({ length: MAX_SHORT_TERM_YEARS }, (_unused, index) => index + 1),
  LONG_TERM_YEARS,
].map((years) => {
  const months = years * MONTHS_PER_YEAR;
  return { value: String(months), label: formatTerm(months) };
});

export interface SavingsInputsProps {
  readonly initialDeposit: string;
  readonly onInitialChange: (value: string) => void;
  readonly monthlyContribution: string;
  readonly onMonthlyChange: (value: string) => void;
  readonly months: string;
  readonly onMonthsChange: (value: string) => void;
  readonly errors: FieldErrors;
}

/** The three questions the savings calculator asks. */
export function SavingsInputs(props: SavingsInputsProps) {
  const { initialDeposit, monthlyContribution, months, errors } = props;

  return (
    <>
      <FormField label="Starting balance" error={errors.initialDeposit}>
        <Input
          name="initialDeposit"
          inputMode="decimal"
          value={initialDeposit}
          onChange={(event) => props.onInitialChange(event.target.value)}
          prefix="£"
        />
      </FormField>

      <FormField label="Adding each month" hint="Enter 0 if you are not adding anything.">
        <Input
          name="monthlyContribution"
          inputMode="decimal"
          value={monthlyContribution}
          onChange={(event) => props.onMonthlyChange(event.target.value)}
          prefix="£"
        />
      </FormField>

      <FormField label="For how long?">
        <Select
          name="months"
          options={TERM_OPTIONS}
          value={months}
          onChange={(event) => props.onMonthsChange(event.target.value)}
        />
      </FormField>
    </>
  );
}
