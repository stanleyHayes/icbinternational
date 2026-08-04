'use client';

/**
 * Converting money between the customer's own currencies.
 *
 * The rate is locked by the quote and the countdown governs the button, exactly as it does on a
 * transfer. Once it runs out the interface re-prices rather than letting the customer act on a
 * number the bank is no longer offering.
 */

import { useState } from 'react';

import type { FxQuoteRequest } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Alert, Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  QuoteTimer,
  Section,
  useUsableAccounts,
} from '@/components/transfers';

import { ConversionSummary } from './conversion-summary';
import { useConversion } from './use-conversion';

/**
 * @example <ConvertForm />
 */
export function ConvertForm() {
  const accounts = useUsableAccounts();
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');

  const from = accounts.data?.find((account) => account.id === fromAccountId);
  const others = (accounts.data ?? []).filter((account) => account.id !== fromAccountId);

  const conversion = useConversion(
    quoteRequest(fromAccountId, toAccountId, amount, from?.currency ?? 'GBP'),
  );

  return (
    <Section title="Convert money" description="Between any two of your own currency accounts.">
      <div className="flex flex-col gap-5">
        <FormAlert error={conversion.convert.error} />
        <FormAlert error={conversion.quoteError} title="We could not price that" />

        <AccountSelect
          label="Convert from"
          accounts={accounts.data ?? []}
          value={fromAccountId}
          onChange={setFromAccountId}
        />

        <AccountSelect
          label="Convert into"
          accounts={others}
          value={toAccountId}
          onChange={setToAccountId}
          hideBalance
        />

        <AmountField
          label="Amount to convert"
          currency={from?.currency ?? 'GBP'}
          value={amount}
          onChange={setAmount}
          available={from?.balance.available.amount}
        />

        <QuotedConversion conversion={conversion} />
      </div>
    </Section>
  );
}

/** The priced request, or `null` while the form is still missing something. */
function quoteRequest(
  fromAccountId: string,
  toAccountId: string,
  amount: string,
  currency: CurrencyCode,
): FxQuoteRequest | null {
  if (!fromAccountId || !toAccountId || !amount) return null;
  return { fromAccountId, toAccountId, sellAmount: { amount, currency } };
}

/** The confirmation, announced rather than merely drawn. */
function Converted() {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Converted">
        The money is in the other account already. You can see it in your balances.
      </Alert>
    </div>
  );
}

/** The priced half of the screen: the figures, the countdown and the one button. */
function QuotedConversion({
  conversion,
}: {
  readonly conversion: ReturnType<typeof useConversion>;
}) {
  if (conversion.convert.data) return <Converted />;
  if (!conversion.quote) return null;

  return (
    <>
      <ConversionSummary quote={conversion.quote} />

      <QuoteTimer
        expiry={conversion.expiry}
        windowSeconds={conversion.windowSeconds}
        onRequote={conversion.requote}
        requoting={conversion.requoting}
        subject="rate"
      />

      <div className="flex justify-end">
        <Button
          disabled={!conversion.usable}
          loading={conversion.convert.isPending}
          onClick={() => conversion.convert.mutate(conversion.quote?.id ?? '')}
        >
          Convert at this rate
        </Button>
      </div>
    </>
  );
}
