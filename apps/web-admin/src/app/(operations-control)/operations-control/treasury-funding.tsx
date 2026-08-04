/**
 * Treasury funding of the clearing account.
 *
 * When value arrives from outside the bank it has to come from somewhere on our own books
 * — the external clearing account — or the trial balance stops summing to zero and the
 * double-entry guarantee is quietly worthless. This posts both legs: a credit to the
 * customer, a matching debit against clearing.
 *
 * It is a treasury function and it is audited like one. The narrative is what the customer
 * reads on their statement, so it is required rather than defaulted.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CURRENCY_CODES, type CurrencyCode } from '@reliance/money';
import { Alert, Button, CurrencyInput, FormField, Input, Select } from '@reliance/ui';

import { DEFAULT_CURRENCY, Panel } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((value) => ({ value, label: value }));

/** What the customer sees on their statement when nothing more specific is given. */
const DEFAULT_NARRATIVE = 'Credit transfer received';

/** Funds a customer account from the bank's external clearing account. */
/**
 * The funding form's fields and the posting they make.
 *
 * The account and amount clear on success but the narrative does not: funding is usually
 * done in a run of several, and retyping the same payer name each time invites a typo on
 * a customer's statement.
 */
function useFunding() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [narrative, setNarrative] = useState(DEFAULT_NARRATIVE);

  const fund = useMutation({
    mutationFn: async () =>
      client.simulation.mint({
        toAccountId: accountId.trim(),
        amount: { amount, currency },
        narrative: narrative.trim(),
      }),
    onSuccess: () => {
      setAccountId('');
      setAmount('0');
      queryClient.invalidateQueries();
    },
  });

  return {
    accountId,
    setAccountId,
    amount,
    setAmount,
    currency,
    setCurrency,
    narrative,
    setNarrative,
    fund,
    ready: accountId.trim().length > 0 && narrative.trim().length > 0 && amount !== '0',
  };
}

/** The amount and the currency it is denominated in, which must be chosen together. */
function AmountFields({
  amount,
  currency,
  onAmount,
  onCurrency,
}: {
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly onAmount: (next: string) => void;
  readonly onCurrency: (next: CurrencyCode) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Amount" required>
        <CurrencyInput currency={currency} value={amount} onValueChange={onAmount} />
      </FormField>
      <FormField label="Currency" required>
        <Select
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={(event) => onCurrency(event.target.value as CurrencyCode)}
        />
      </FormField>
    </div>
  );
}

/** What the desk is told before and after the posting. */
function FundingNotices({ error, funded }: { readonly error: unknown; readonly funded: boolean }) {
  return (
    <>
      {error ? <Alert tone="danger">{messageFor(error)}</Alert> : null}
      {funded && (
        <Alert tone="success" title="Funded">
          The credit is on the customer&apos;s account and the matching debit is against clearing.
          The trial balance still foots.
        </Alert>
      )}
      <Alert tone="info" title="Both legs are posted">
        Value entering the bank is debited from the external clearing account, so the book stays
        balanced. There is no way to credit a customer from nowhere.
      </Alert>
    </>
  );
}

/** Who is being funded, how much, and what their statement will say. */
function FundingForm() {
  const {
    accountId,
    setAccountId,
    amount,
    setAmount,
    currency,
    setCurrency,
    narrative,
    setNarrative,
    fund,
    ready,
  } = useFunding();

  return (
    <div className="flex flex-col gap-4">
      <FundingNotices error={fund.error} funded={fund.isSuccess} />

      <FormField label="Customer account" required hint="The account receiving the funds.">
        <Input value={accountId} onChange={(event) => setAccountId(event.target.value)} />
      </FormField>

      <AmountFields
        amount={amount}
        currency={currency}
        onAmount={setAmount}
        onCurrency={setCurrency}
      />

      <FormField
        label="Statement narrative"
        required
        hint="What the customer reads on their statement. Write it as the payer would be named."
      >
        <Input value={narrative} onChange={(event) => setNarrative(event.target.value)} />
      </FormField>

      <div>
        <Button loading={fund.isPending} disabled={!ready} onClick={() => fund.mutate()}>
          Fund the account
        </Button>
      </div>
    </div>
  );
}

export function TreasuryFunding() {
  return (
    <Panel
      title="Treasury funding"
      description="Credit a customer account from the external clearing account, with both legs posted."
    >
      <FundingForm />
    </Panel>
  );
}
