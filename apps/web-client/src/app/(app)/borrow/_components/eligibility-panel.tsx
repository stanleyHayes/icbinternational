'use client';

/**
 * A real eligibility check.
 *
 * Unlike the calculator, this one is an assessment: it runs against the customer's file and is
 * visible to us. That is stated before the button, because the difference between the two is
 * exactly what people worry about.
 *
 * A decline names its reasons. "You are not eligible" with no reason is the single most
 * complained-about sentence in consumer lending.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { LoanEligibilityRequest } from '@reliance/api-client';
import type { LoanEligibility, LoanProduct } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { AmountField, MoneyCell, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { ProductSelect, TermField } from './calculator';
import { aprLabel } from './lending-look';

const DEFAULT_TERM = '36';

/** What the assessment came back with, said plainly. */
function Outcome({ result }: { readonly result: LoanEligibility }) {
  if (!result.eligible) {
    return (
      <Alert tone="warning" title="We cannot offer this at the moment">
        <ul className="list-inside list-disc">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Alert>
    );
  }

  return (
    <Alert tone="success" title="You could borrow this">
      <p>
        Up to <MoneyCell money={result.maxAmount} muted srLabel="Maximum available" />
        {result.indicativeAprBps === null
          ? '.'
          : ` at around ${aprLabel(result.indicativeAprBps)} APR.`}
      </p>
      <p className="mt-2">
        This is an indication based on what we know today. The rate on a full application can
        differ.
      </p>
    </Alert>
  );
}

/** Runs the assessment. A read from the customer's side, an event from underwriting's. */
function useEligibilityCheck() {
  return useMutation({
    mutationFn: async (body: LoanEligibilityRequest) =>
      (await browserApi().borrow.eligibility(body)).data,
  });
}

/** Props for {@link EligibilityPanel}. */
export interface EligibilityPanelProps {
  readonly products: readonly LoanProduct[];
}

/**
 * @example <EligibilityPanel products={products} />
 */
export function EligibilityPanel({ products }: EligibilityPanelProps) {
  const [productCode, setProductCode] = useState(products[0]?.code ?? '');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState(DEFAULT_TERM);

  const product = products.find((candidate) => candidate.code === productCode);
  const check = useEligibilityCheck();

  const run = (): void =>
    check.mutate({
      productCode,
      amount: { amount, currency: product?.currency ?? 'GBP' },
      termMonths: Number(termMonths),
    });

  return (
    <Section
      title="Check what you could borrow"
      description="This is a real assessment against your file, and we can see it. It does not commit you to anything."
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={check.error} />

        <ProductSelect products={products} value={productCode} onChange={setProductCode} />

        <AmountField
          label="How much"
          currency={product?.currency ?? 'GBP'}
          value={amount}
          onChange={setAmount}
        />

        <TermField value={termMonths} onChange={setTermMonths} />

        <div className="flex justify-end">
          <Button disabled={!amount} loading={check.isPending} onClick={run}>
            Check my eligibility
          </Button>
        </div>

        {check.data ? <Outcome result={check.data} /> : null}
      </div>
    </Section>
  );
}
