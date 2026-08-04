'use client';

/**
 * Paying a bill.
 *
 * The biller decides what its customer reference looks like, and the contract carries the pattern,
 * so the field is validated against the biller's own rule before anything is sent. A bill payment
 * rejected two days later for a mistyped reference is a refund, a phone call and a late charge.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Biller, CreateBillPaymentRequest } from '@reliance/contracts';
import { Alert, Button, Checkbox, FormField, Input } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  useUsableAccounts,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Props for {@link PayBillForm}. */
export interface PayBillFormProps {
  readonly billerId: string;
}

/** Sends the payment and refreshes the balances and receipts it touches. */
function usePayBill() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateBillPaymentRequest) =>
      (await browserApi().payments.payBill(body)).data,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.payments.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });
}

/** True when the reference matches the pattern this biller publishes. */
function referenceMatches(biller: Biller, reference: string): boolean {
  if (!biller.accountNumberPattern) return reference.trim().length > 0;
  return new RegExp(biller.accountNumberPattern).test(reference.trim());
}

/** The fields, the validity rule and the mutation, held together. */
function useBillForm(biller: Biller) {
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [saveBiller, setSaveBiller] = useState(false);
  const [touched, setTouched] = useState(false);
  const pay = usePayBill();

  const valid = referenceMatches(biller, reference);
  const ready = Boolean(sourceAccountId && amount && valid);

  const submit = (): void => {
    setTouched(true);
    if (!ready) return;
    pay.mutate({
      billerId: biller.id,
      sourceAccountId,
      customerReference: reference.trim(),
      amount: { amount, currency: biller.minAmount.currency },
      saveBiller,
    });
  };

  return {
    sourceAccountId,
    setSourceAccountId,
    reference,
    setReference,
    amount,
    setAmount,
    saveBiller,
    setSaveBiller,
    invalid: touched && !valid,
    markTouched: () => setTouched(true),
    ready,
    pay,
    submit,
  };
}

function BillForm({ biller }: { readonly biller: Biller }) {
  const accounts = useUsableAccounts();
  const form = useBillForm(biller);

  return (
    <Section title={`Pay ${biller.name}`} description={feeLine(biller)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={form.pay.error} />
        {form.pay.isSuccess ? <PaidNotice biller={biller} /> : null}

        <AccountSelect
          label="Pay from"
          accounts={accounts.data ?? []}
          value={form.sourceAccountId}
          onChange={form.setSourceAccountId}
        />

        <ReferenceField
          biller={biller}
          value={form.reference}
          invalid={form.invalid}
          onChange={form.setReference}
          onBlur={form.markTouched}
        />

        <AmountField
          label="Amount"
          currency={biller.minAmount.currency}
          value={form.amount}
          onChange={form.setAmount}
        />

        <BillerLimits biller={biller} />
        <SaveBiller checked={form.saveBiller} onChange={form.setSaveBiller} />
        <PayRow disabled={!form.ready} pending={form.pay.isPending} onSubmit={form.submit} />
      </div>
    </Section>
  );
}

/** What the biller charges, and the amounts it will take. */
function feeLine(biller: Biller): string {
  return biller.fee.amount === '0'
    ? 'There is no charge for paying this biller.'
    : 'A fee applies to this biller; it is shown on your receipt.';
}

/** The confirmation, announced. */
function PaidNotice({ biller }: { readonly biller: Biller }) {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Sent to the biller">
        <p>
          We have sent the payment to {biller.name}. If they refuse it, the money comes straight
          back to your account and we will tell you why.
        </p>
      </Alert>
    </div>
  );
}

/**
 * @example <PayBillForm billerId={billerId} />
 */
export function PayBillForm({ billerId }: PayBillFormProps) {
  const biller = useQuery({
    queryKey: movementKeys.payments.biller(billerId),
    queryFn: async () => (await browserApi().payments.getBiller(billerId)).data,
  });

  return (
    <QueryPanel query={biller} skeletonRows={3}>
      {(data) => <BillForm biller={data} />}
    </QueryPanel>
  );
}

/** Exported so the biller screen can show the limits beside the form. */
export function BillerLimits({ biller }: { readonly biller: Biller }) {
  return (
    <p className="text-fg-muted text-sm">
      Between <MoneyCell money={biller.minAmount} muted srLabel="Smallest payment" /> and{' '}
      <MoneyCell money={biller.maxAmount} muted srLabel="Largest payment" />.
    </p>
  );
}

/** Props for {@link ReferenceField}. */
interface ReferenceFieldProps {
  readonly biller: Biller;
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}

/** The customer's reference with this biller, checked against the biller's own format. */
function ReferenceField({ biller, value, invalid, onChange, onBlur }: ReferenceFieldProps) {
  return (
    <FormField
      label={biller.accountNumberLabel}
      hint="Exactly as it appears on your bill."
      error={invalid ? `That does not look like a ${biller.name} reference.` : undefined}
      required
    >
      <Input
        value={value}
        autoComplete="off"
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

/** Offering to remember the biller, so the next bill is two taps. */
function SaveBiller({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
      Save this biller so paying it again takes two taps
    </Checkbox>
  );
}

/** The one action on the form. */
function PayRow({
  disabled,
  pending,
  onSubmit,
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button disabled={disabled} loading={pending} onClick={onSubmit}>
        Pay this bill
      </Button>
    </div>
  );
}
