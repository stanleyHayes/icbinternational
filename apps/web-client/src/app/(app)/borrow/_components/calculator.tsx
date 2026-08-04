'use client';

/**
 * What a loan would cost.
 *
 * This is a calculator, not an application: it does not touch the customer's file, it is not seen
 * by underwriting, and it says so. The distinction matters because people are — rightly — wary of
 * "checking" anything with a bank in case it leaves a mark.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { LoanCalculationRequest, LoanProduct, LoanQuote } from '@reliance/contracts';
import { Button, FormField, Input, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { AmountField, DetailList, MoneyCell, Section, type Detail } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { aprLabel } from './lending-look';

const DEFAULT_TERM = '36';
const MIN_TERM = 6;
const MAX_TERM = 480;

function quoteRows(quote: LoanQuote): Detail[] {
  return [
    {
      id: 'monthly',
      label: 'Each month',
      value: <MoneyCell money={quote.monthlyPayment} size="lg" srLabel="Monthly repayment" />,
    },
    { id: 'apr', label: 'Rate', value: `${aprLabel(quote.aprBps)} APR` },
    {
      id: 'interest',
      label: 'Interest over the term',
      value: <MoneyCell money={quote.totalInterest} muted />,
    },
    {
      id: 'fee',
      label: 'Arrangement fee',
      value: <MoneyCell money={quote.arrangementFee} muted />,
    },
    {
      id: 'total',
      label: 'Total you would repay',
      value: <MoneyCell money={quote.totalRepayable} size="lg" srLabel="Total repayable" />,
    },
  ];
}

/** Props for {@link Calculator}. */
export interface CalculatorProps {
  readonly products: readonly LoanProduct[];
}

/**
 * @example <Calculator products={products} />
 */
export function Calculator({ products }: CalculatorProps) {
  const [productCode, setProductCode] = useState(products[0]?.code ?? '');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState(DEFAULT_TERM);

  const calculate = useMutation({
    mutationFn: async (body: LoanCalculationRequest) =>
      (await browserApi().borrow.calculate(body)).data,
  });

  const product = products.find((candidate) => candidate.code === productCode);
  const ready = Boolean(productCode && amount && termMonths);

  const run = (): void => {
    if (!ready || !product) return;
    calculate.mutate({
      productCode,
      amount: { amount, currency: product.currency },
      termMonths: Number(termMonths),
    });
  };

  return (
    <Section
      title="What would it cost?"
      description="An illustration only. Nothing here touches your credit file or is seen by us."
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={calculate.error} />

        <ProductSelect products={products} value={productCode} onChange={setProductCode} />

        <AmountField
          label="How much"
          currency={product?.currency ?? 'GBP'}
          value={amount}
          onChange={setAmount}
        />

        <TermField value={termMonths} onChange={setTermMonths} />

        <RunButton disabled={!ready} pending={calculate.isPending} onRun={run} />

        {calculate.data ? <DetailList items={quoteRows(calculate.data)} /> : null}
      </div>
    </Section>
  );
}

/** The catalogue, with each product's representative rate on the option itself. */
export function ProductSelect({
  products,
  value,
  onChange,
}: {
  readonly products: readonly LoanProduct[];
  readonly value: string;
  readonly onChange: (code: string) => void;
}) {
  return (
    <FormField label="What kind of borrowing?" required>
      <Select
        value={value}
        options={products.map((product) => ({
          value: product.code,
          label: `${product.name} · ${aprLabel(product.representativeAprBps)} representative APR`,
        }))}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

/** How long the borrowing runs for, in months. */
export function TermField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField label="Over how many months" required>
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_TERM}
        max={MAX_TERM}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

/** The one action on this screen: work it out. */
function RunButton({
  disabled,
  pending,
  onRun,
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onRun: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button disabled={disabled} loading={pending} onClick={onRun}>
        Work it out
      </Button>
    </div>
  );
}
