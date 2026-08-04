'use client';

/**
 * Splitting a bill.
 *
 * Shares rather than fixed amounts, because "three of us but Sam had two courses" is the actual
 * problem people are solving. The split is computed by the API in minor units so the pennies land
 * somewhere real rather than disappearing into rounding.
 *
 * The requester's own share is excluded by default: you are not asking yourself for money.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { Account, Money, SplitBillRequest } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Alert, Button, Checkbox, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { AccountSelect, AmountField, Section, useUsableAccounts } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { ParticipantRows, blankParticipant, type Participant } from './participant-rows';

const NOTE_MAX = 500;

/**
 * @example <SplitBillForm />
 */
export function SplitBillForm() {
  const accounts = useUsableAccounts();
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [excludeSelf, setExcludeSelf] = useState(true);
  const [people, setPeople] = useState<Participant[]>([blankParticipant()]);
  const split = useSplitBill();

  const account = accounts.data?.find((candidate) => candidate.id === destinationAccountId);
  const named = people.filter((person) => person.name.trim() !== '');
  const ready = Boolean(destinationAccountId && total && named.length > 0);

  const totalAmount = { amount: total, currency: account?.currency ?? 'GBP' } as Money;
  const submit = (): void => {
    if (ready) {
      split.mutate(splitRequest({ destinationAccountId, totalAmount, named, excludeSelf, note }));
    }
  };

  return (
    <Section title="Split a bill" description="One request each, weighted by shares.">
      <div className="flex flex-col gap-5">
        <FormAlert error={split.error} />
        <SplitSent requests={split.data} />

        <BillFields
          accounts={accounts.data ?? []}
          destinationAccountId={destinationAccountId}
          total={total}
          currency={totalAmount.currency}
          onAccount={setDestinationAccountId}
          onTotal={setTotal}
        />

        <ParticipantRows people={people} onChange={setPeople} />
        <ExcludeSelf checked={excludeSelf} onChange={setExcludeSelf} />
        <NoteField value={note} onChange={setNote} />
        <SendRow disabled={!ready} pending={split.isPending} onSubmit={submit} />
      </div>
    </Section>
  );
}

/** Creates one request per participant. Nothing is charged; each person chooses to pay. */
function useSplitBill() {
  return useMutation({
    mutationFn: async (body: SplitBillRequest) =>
      (await browserApi().payments.splitBill(body)).data,
  });
}

/** Everything the split request is built from. */
interface SplitInput {
  readonly destinationAccountId: string;
  readonly totalAmount: Money;
  readonly named: readonly Participant[];
  readonly excludeSelf: boolean;
  readonly note: string;
}

/** The split request, built once every required field is present. */
function splitRequest(input: SplitInput): SplitBillRequest {
  return {
    destinationAccountId: input.destinationAccountId,
    totalAmount: input.totalAmount,
    participants: input.named.map((person) => ({
      name: person.name.trim(),
      shares: Number(person.shares) || 1,
    })),
    excludeSelf: input.excludeSelf,
    ...(input.note.trim() ? { note: input.note.trim() } : {}),
  };
}

/** What the bill was for. Optional, and it is what each person sees on their request. */
function NoteField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Textarea
      value={value}
      maxLength={NOTE_MAX}
      showCount
      aria-label="What the bill was for"
      placeholder="What was it for? Dinner at the Ivy, weekend cottage…"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The confirmation, counting what actually went out. */
function SplitSent({ requests }: { readonly requests: readonly unknown[] | undefined }) {
  if (!requests) return null;

  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Requests sent">
        We have created {requests.length} requests. Each person gets their own link, and you can see
        who has paid on the request money screen.
      </Alert>
    </div>
  );
}

/** Whether the requester's own share is asked for. It is not, by default. */
function ExcludeSelf({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
      Leave my own share out of the requests
    </Checkbox>
  );
}

/** The one action on the form. */
function SendRow({
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
        Send the requests
      </Button>
    </div>
  );
}

/** Props for {@link BillFields}. */
interface BillFieldsProps {
  readonly accounts: readonly Account[];
  readonly destinationAccountId: string;
  readonly total: string;
  readonly currency: CurrencyCode;
  readonly onAccount: (accountId: string) => void;
  readonly onTotal: (total: string) => void;
}

/** Where the money lands, and how much there is to divide. */
function BillFields(props: BillFieldsProps) {
  return (
    <>
      <AccountSelect
        label="Money comes to"
        accounts={props.accounts}
        value={props.destinationAccountId}
        onChange={props.onAccount}
        hideBalance
      />

      <AmountField
        label="Total to split"
        currency={props.currency}
        value={props.total}
        onChange={props.onTotal}
      />
    </>
  );
}
