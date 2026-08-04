'use client';

import { FormField, Input, Select } from '@reliance/ui';

import type { FieldErrors } from '@/lib/actions/form-state';
import { formatTerm } from '@/lib/format';

/** Terms the lending catalogue offers: one to seven years, in whole years. */
const MONTHS_PER_YEAR = 12;
const MAX_TERM_YEARS = 7;

const TERM_OPTIONS = Array.from({ length: MAX_TERM_YEARS }, (_unused, index) => {
  const months = (index + 1) * MONTHS_PER_YEAR;
  return { value: String(months), label: formatTerm(months) };
});

/** A named loan product the calculator can quote. */
export interface LoanChoice {
  readonly code: string;
  readonly name: string;
}

export interface LoanInputsProps {
  readonly amount: string;
  readonly onAmountChange: (value: string) => void;
  readonly termMonths: string;
  readonly onTermChange: (value: string) => void;
  readonly productCode: string;
  readonly onProductChange: (value: string) => void;
  readonly products: readonly LoanChoice[];
  readonly errors: FieldErrors;
}

/** The three questions the loan calculator asks. */
export function LoanInputs(props: LoanInputsProps) {
  const { amount, termMonths, productCode, products, errors } = props;

  return (
    <>
      <FormField label="What do you want to borrow?" error={errors.amount} required>
        <Input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => props.onAmountChange(event.target.value)}
          prefix="£"
          required
        />
      </FormField>

      <FormField label="Over how long?" required>
        <Select
          name="termMonths"
          options={TERM_OPTIONS}
          value={termMonths}
          onChange={(event) => props.onTermChange(event.target.value)}
        />
      </FormField>

      <FormField label="Which loan?" required>
        <Select
          name="productCode"
          options={products.map((product) => ({ value: product.code, label: product.name }))}
          value={productCode}
          onChange={(event) => props.onProductChange(event.target.value)}
        />
      </FormField>
    </>
  );
}
